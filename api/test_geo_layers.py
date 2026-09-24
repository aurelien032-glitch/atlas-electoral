import duckdb
import json
from database import create_connection

try:
    conn = create_connection()
    
    # Test Circonscriptions
    print("=== Testing Circonscriptions ===")
    query = "SELECT COUNT(*) FROM circonscriptions"
    count = conn.execute(query).fetchone()[0]
    print(f"Total Circos: {count}")
    
    # Sample geometry check
    query_sample = "SELECT codeCirconscription, ST_IsValid(geom) as valid, ST_GeometryType(geom) as gtype FROM circonscriptions LIMIT 5"
    print(conn.execute(query_sample).df())
    
    # Test Communes
    print("\n=== Testing Communes ===")
    query = "SELECT COUNT(*) FROM communes"
    count = conn.execute(query).fetchone()[0]
    print(f"Total Communes: {count}")
    
    query_sample = "SELECT codeCommune, ST_IsValid(geom) as valid, ST_GeometryType(geom) as gtype FROM communes LIMIT 5"
    print(conn.execute(query_sample).df())
    
    # Test Bureaux
    print("\n=== Testing Bureaux ===")
    query = "SELECT COUNT(*) FROM bureaux"
    count = conn.execute(query).fetchone()[0]
    print(f"Total Bureaux: {count}")
    
    query_sample = "SELECT id_bv, ST_IsValid(geom) as valid, ST_GeometryType(geom) as gtype FROM bureaux LIMIT 5"
    print(conn.execute(query_sample).df())
    
    # Count invalid geometries per table
    print("\n=== Invalid Geometry Count ===")
    for tbl in ["departements", "circonscriptions", "communes", "bureaux"]:
        try:
            nb_invalid = conn.execute(f"SELECT COUNT(*) FROM {tbl} WHERE NOT ST_IsValid(geom)").fetchone()[0]
            print(f"{tbl}: {nb_invalid} invalid geometries")
        except Exception as e:
            print(f"{tbl}: Error - {e}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
