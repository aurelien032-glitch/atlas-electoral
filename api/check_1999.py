import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Checking Bureau Matches for 1999 Euro:")
    query = """
        SELECT COUNT(*) 
        FROM '/data/Election/general_results.parquet' r 
        JOIN '/data/Election/table-bv-reu.parquet' t 
        ON r.id_brut_miom = t.id_brut_miom
        WHERE r.id_election = '1999_euro_t1' 
    """
    count = conn.execute(query).fetchone()[0]
    print(f"1999 Matches: {count}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
