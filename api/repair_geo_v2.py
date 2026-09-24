import duckdb
from database import create_connection

def rebuild_geo_polished():
    try:
        conn = create_connection()
        print("Rebuilding GIS with high-fidelity topology...")
        
        conn.execute("DROP TABLE IF EXISTS departements")
        conn.execute("DROP TABLE IF EXISTS circonscriptions")
        conn.execute("DROP TABLE IF EXISTS communes")
        conn.execute("DROP TABLE IF EXISTS bureaux")
        
        geo_file = "/data/Map/contours-france-entiere-latest-v2.geojson"
        print(f"Loading and validating Bureaux...")
        # Use ST_MakeValid and avoid any simplification that could create holes
        conn.execute(f"""
            CREATE TABLE bureaux AS 
            SELECT * EXCLUDE(geom), ST_MakeValid(geom) as geom 
            FROM ST_Read('{geo_file}')
        """)
        
        print("Aggregating Communes (Hifi)...")
        conn.execute("""
            CREATE TABLE communes AS 
            SELECT codeCommune, nomCommune, codeDepartement, codeCirconscription, ST_MakeValid(ST_Buffer(ST_Union_Agg(ST_MakeValid(geom)), 0)) as geom 
            FROM bureaux 
            GROUP BY codeCommune, nomCommune, codeDepartement, codeCirconscription
        """)
        
        print("Aggregating Circonscriptions (Hifi)...")
        conn.execute("""
            CREATE TABLE circonscriptions AS 
            SELECT codeCirconscription, nomCirconscription, codeDepartement, ST_MakeValid(ST_Buffer(ST_Union_Agg(ST_MakeValid(geom)), 0)) as geom 
            FROM bureaux 
            GROUP BY codeCirconscription, nomCirconscription, codeDepartement
        """)
        
        print("Aggregating Departements (Hifi)...")
        conn.execute("""
            CREATE TABLE departements AS 
            SELECT codeDepartement, nomDepartement, ST_MakeValid(ST_Buffer(ST_Union_Agg(ST_MakeValid(geom)), 0)) as geom 
            FROM bureaux 
            GROUP BY codeDepartement, nomDepartement
        """)
        
        print("GIS Rebuild Successful.")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    rebuild_geo_polished()
