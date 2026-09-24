import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Checking Circo Codes for Regionales 2021:")
    query = """
        SELECT "Code de la circonscription", COUNT(*) 
        FROM '/data/Election/general_results.parquet' 
        WHERE id_election = '2021_regi_t1'
        GROUP BY "Code de la circonscription"
        LIMIT 10
    """
    print(conn.execute(query).df())
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
