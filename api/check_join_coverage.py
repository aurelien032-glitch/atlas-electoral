import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Checking Bureau Matches for 2002 Presidentielle:")
    query = """
        SELECT COUNT(*) 
        FROM '/data/Election/general_results.parquet' r 
        JOIN '/data/Election/table-bv-reu.parquet' t 
        ON r.id_brut_miom = t.id_brut_miom
        WHERE r.id_election = '2002_pres_t1' 
    """
    count_2002 = conn.execute(query).fetchone()[0]
    print(f"2002 Matches: {count_2002}")
    
    print("Checking Bureau Matches for 2022 Presidentielle:")
    count_2022 = conn.execute("""
        SELECT COUNT(*) 
        FROM '/data/Election/general_results.parquet' r 
        JOIN '/data/Election/table-bv-reu.parquet' t 
        ON r.id_brut_miom = t.id_brut_miom
        WHERE r.id_election = '2022_pres_t1' 
    """).fetchone()[0]
    print(f"2022 Matches: {count_2022}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
