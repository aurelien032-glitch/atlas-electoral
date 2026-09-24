import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Checking Circo Codes for Municipales 2020:")
    query = """
        SELECT "Code de la circonscription", COUNT(*) 
        FROM '/data/Election/general_results.parquet' 
        WHERE id_election = '2020_muni_t1'
        GROUP BY "Code de la circonscription"
        LIMIT 10
    """
    print(conn.execute(query).df())
    
    print("\nChecking Empty String Check:")
    query_check = """
        SELECT 
            id_election,
            COUNT("Code de la circonscription") as raw_count,
            COUNT(NULLIF("Code de la circonscription", '')) as nullif_count
        FROM '/data/Election/general_results.parquet'
        WHERE id_election IN ('2020_muni_t1', '2022_legi_t1')
        GROUP BY id_election
    """
    print(conn.execute(query_check).df())
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
