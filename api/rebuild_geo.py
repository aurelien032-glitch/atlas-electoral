import duckdb
from database import create_connection

def rebuild_geo():
    try:
        conn = create_connection(read_only=False)
        print("Dropping existing geo tables for rebuild...")
        conn.execute("DROP TABLE IF EXISTS departements")
        conn.execute("DROP TABLE IF EXISTS circonscriptions")
        conn.execute("DROP TABLE IF EXISTS communes")
        conn.execute("DROP TABLE IF EXISTS bureaux")
        
        geo_file = "/data/Map/contours-france-entiere-latest-v2.json"
        print(f"Loading and repairing Bureaux from {geo_file}...")
        # Load and ensure validity
        conn.execute(f"CREATE TABLE bureaux AS SELECT * EXCLUDE(geom), ST_MakeValid(geom) as geom FROM ST_Read('{geo_file}')")
        
        # Aggregate with validity checks
        print("Aggregating Communes...")
        conn.execute("""
            CREATE TABLE communes AS 
            SELECT codeCommune, nomCommune, codeDepartement, codeCirconscription, ST_Union_Agg(geom) as geom 
            FROM bureaux 
            GROUP BY codeCommune, nomCommune, codeDepartement, codeCirconscription
        """)
        
        print("Aggregating Circonscriptions...")
        conn.execute("""
            CREATE TABLE circonscriptions AS 
            SELECT codeCirconscription, nomCirconscription, codeDepartement, ST_Union_Agg(geom) as geom 
            FROM bureaux 
            GROUP BY codeCirconscription, nomCirconscription, codeDepartement
        """)
        
        print("Aggregating Departements...")
        conn.execute("""
            CREATE TABLE departements AS 
            SELECT codeDepartement, nomDepartement, ST_Union_Agg(geom) as geom 
            FROM bureaux 
            GROUP BY codeDepartement, nomDepartement
        """)
        
        # Verify
        print("Verification:")
        for tbl in ["bureaux", "communes", "circonscriptions", "departements"]:
            count = conn.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            invalid = conn.execute(f"SELECT COUNT(*) FROM {tbl} WHERE NOT ST_IsValid(geom)").fetchone()[0]
            print(f"- {tbl}: {count} total, {invalid} invalid")
            
        conn.close()
        print("Rebuild complete.")
    except Exception as e:
        print(f"Error during rebuild: {e}")

if __name__ == "__main__":
    rebuild_geo()
