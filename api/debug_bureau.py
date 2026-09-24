import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Testing Bureau JOIN Query...")
    # Exact logic from elections.py
    query = """
        SELECT 
            t.id_brut_reu as code,
            t.libelle_reu as name,
            SUM("Inscrits") as Inscrits
        FROM '/data/Election/general_results.parquet' r 
        JOIN '/data/Election/table-bv-reu.parquet' t 
        ON r.id_brut_miom = t.id_brut_miom
        WHERE r.id_election LIKE '2022_pres%' 
        GROUP BY t.id_brut_reu, t.libelle_reu
        LIMIT 5
    """
    res = conn.execute(query).df()
    print(res)
    
    print("\nCount of matches:")
    count = conn.execute("""
        SELECT COUNT(*) 
        FROM '/data/Election/general_results.parquet' r 
        JOIN '/data/Election/table-bv-reu.parquet' t 
        ON r.id_brut_miom = t.id_brut_miom
        WHERE r.id_election LIKE '2022_pres%' 
    """).fetchone()[0]
    print(f"Rows matched: {count}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
