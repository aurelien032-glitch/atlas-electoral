import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("=== CIRCO KEYS ===")
    print(conn.execute("""
        SELECT DISTINCT "Code du département", "Code de la circonscription" 
        FROM '/data/Election/general_results.parquet' 
        WHERE id_election LIKE '2022_legi%' 
        LIMIT 10
    """).df())
    conn.close()
except Exception as e:
    print(f"Error: {e}")
