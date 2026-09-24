import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("=== REU Table Sample ===")
    res = conn.execute("SELECT code_commune, id_brut_reu, id_brut_miom FROM '/data/Election/table-bv-reu.parquet' LIMIT 5").df()
    print(res)
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
