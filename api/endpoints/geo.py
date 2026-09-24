from fastapi import APIRouter, Depends, HTTPException, Query, Response
from database import get_db_connection
import duckdb
import os
import json

router = APIRouter(prefix="/geo", tags=["geo"])

# Variable global to hold connection/status if we use in-memory persistent table shared across requests
# But get_db_connection yields a new connection.
# For DuckDB in-memory with shared state, we might need a singleton connection or use the file-based persistent DB defined in docker-compose.
# docker-compose has `DUCKDB_DATABASE=/data/transparence.duckdb`
# So tables created will vary persist.

def init_geo_data(conn: duckdb.DuckDBPyConnection, force: bool = False):
    """
    Initialize geographical data (Bureau contours).
    In Production (Docker), we expect the 'bureaux' table to already exist in consolidated.duckdb.
    We only attempt to load from file if table is missing AND file exists.
    """
    # Check if data loaded
    if not force:
        try:
            # Check if table exists
            conn.execute("SELECT 1 FROM bureaux LIMIT 1")
            print("Geo tables already exist.")
            return
        except:
            pass # Continue to load
    
    if force:
        print("Forcing re-initialization... Dropping tables.")
        conn.execute("DROP TABLE IF EXISTS bureaux")
        conn.execute("DROP TABLE IF EXISTS circonscriptions")
        conn.execute("DROP TABLE IF EXISTS communes")
        conn.execute("DROP TABLE IF EXISTS departements")

    # Check if ALL tables exist
    tables = conn.execute("SELECT table_name FROM information_schema.tables WHERE table_name IN ('bureaux', 'communes', 'circonscriptions', 'departements')").fetchall()
    existing_tables = set(t[0] for t in tables)
    if {'bureaux', 'communes', 'circonscriptions', 'departements'}.issubset(existing_tables) and not force:
        print("✅ All geo tables already exist. Skipping initialization.")
        return

    # Fallback for Dev/Init: Load from GPKG
    import os
    geo_file = os.getenv("GEO_FILE_PATH", "/data/Map/contours-france-entiere-latest-v2.json")
    
    if not os.path.exists(geo_file):
        print(f"⚠️ Geo file not found at {geo_file}. Skipping initialization. Spatial features might fail.")
        return

    print(f"Loading {geo_file}...")
    try:
        conn.execute("INSTALL spatial; LOAD spatial;")
        
        # Load Bureaux (Base Layer)
        if 'bureaux' not in existing_tables or force:
            print("Loading Bureaux...")
            # Assuming Bureaux is the main layer or we need to specify?
            # If multiple layers, ST_Read might return the first one. 
            # Usually Admin Express has `commune`, `departement`. 
            # But here users file seems to be `contours...`.
            # Let's trust the previous code that `ST_Read(file)` loads bureaux.
            conn.execute(f"CREATE OR REPLACE TABLE bureaux AS SELECT * EXCLUDE(geom), ST_Transform(ST_MakeValid(geom), 'OGC:CRS84', 'EPSG:3857') as geom FROM ST_Read('{geo_file}')")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_bureaux_code_commune ON bureaux(codeCommune)")

        # Aggregations
        if 'circonscriptions' not in existing_tables or force:
           print("Aggregating Circonscriptions...")
           conn.execute("""
               CREATE OR REPLACE TABLE circonscriptions AS 
               SELECT codeCirconscription, nomCirconscription, codeDepartement, ST_MakeValid(ST_Buffer(ST_Union_Agg(geom), 0)) as geom 
               FROM bureaux 
               GROUP BY codeCirconscription, nomCirconscription, codeDepartement
           """)

        if 'communes' not in existing_tables or force:
           print("Aggregating Communes...")
           conn.execute("""
               CREATE OR REPLACE TABLE communes AS 
               SELECT codeCommune, nomCommune, codeDepartement, codeCirconscription, ST_MakeValid(ST_Buffer(ST_Union_Agg(geom), 0)) as geom 
               FROM bureaux 
               GROUP BY codeCommune, nomCommune, codeDepartement, codeCirconscription
           """)

        if 'departements' not in existing_tables or force:
            print("Aggregating Departements...")
            conn.execute("""
                CREATE OR REPLACE TABLE departements AS 
                SELECT codeDepartement, nomDepartement, ST_MakeValid(ST_Buffer(ST_Union_Agg(geom), 0)) as geom 
                FROM bureaux 
                GROUP BY codeDepartement, nomDepartement
            """)
            
    except Exception as e:
        print(f"❌ Failed to init geo data: {e}")
        return
    
    # Checkpoint
    # conn.checkpoint() # If persistent

@router.on_event("startup")
async def startup_event():
    # We can't easily hook into router startup strictly with just router, 
    # but we can call this from main's startup. 
    # Or just do lazy loading.
    pass

@router.get("/init")
def trigger_init(force: bool = False):
    """
    Manual trigger to initialize tables (since auto-startup might timeout or block).
    """
    from database import create_connection
    conn = create_connection(read_only=False)
    try:
        init_geo_data(conn, force=force)
    finally:
        conn.close()
    return {"status": "initialized"}

@router.get("/layer/{level}")
def get_layer(
    level: str, 
    code_departement: str = None,
    code_circonscription: str = None,
    code_commune: str = None,
    simplify: float = 0.0,
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Get GeoJSON for a level with optional filtering.
    """
    allowed = ["departements", "circonscriptions", "communes", "bureaux"]
    if level not in allowed:
        raise HTTPException(400, "Invalid level")
    
    try:
        where_clauses = []
        if code_departement:
            where_clauses.append(f"codeDepartement = '{code_departement}'")
        if code_circonscription:
            where_clauses.append(f"codeCirconscription = '{code_circonscription}'")
        if code_commune:
            where_clauses.append(f"codeCommune = '{code_commune}'")
        
        where_str = ""
        if where_clauses:
            where_str = " WHERE " + " AND ".join(where_clauses)

        # For bureaux, we MUST have a filter OR we limit (safety)
        limit_str = ""
        if level == "bureaux" and not code_commune:
             limit_str = " LIMIT 1000" # Safety if no filter

        geom_col = "geom"
        if simplify > 0:
            # Use ST_SimplifyPreserveTopology to avoid gaps between polygons
            geom_col = f"ST_SimplifyPreserveTopology(geom, {simplify})"

        query = f"SELECT ST_AsGeoJSON({geom_col}) as g, * EXCLUDE(geom) FROM {level}{where_str}{limit_str}"
        print(f"Executing Geo Query: {query}")
        
        rows = conn.execute(query).fetchall()
        col_names = [desc[0] for desc in conn.description]
        
        features = []
        for row in rows:
            # row[0] is geometry json
            geom = json.loads(row[0])
            # Properties exclude the 1st column (g)
            props = {col_names[i]: row[i] for i in range(1, len(col_names))}
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": props
            })
        
        return {
            "type": "FeatureCollection",
            "features": features
        }

    except Exception as e:
        print(f"Geo Error: {e}")
        return {"error": str(e), "hint": "Check if tables exist and columns match"}

