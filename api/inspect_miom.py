import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("=== RESULTS ID_BRUT_MIOM ===")
    print(conn.execute("""
        SELECT id_brut_miom, "Code du département", "Code de la commune", "Code du b.vote" 
        FROM '/data/Election/general_results.parquet' 
        WHERE id_election LIKE '2022%' 
        LIMIT 5
    """).df())
    conn.close()
except Exception as e:
    print(f"Error: {e}")
