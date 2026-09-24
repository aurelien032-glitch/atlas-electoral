import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("=== GEO TABLE (bureaux) ===")
    print(conn.execute("SELECT codeCommune, codeDepartement, id_bv FROM bureaux LIMIT 5").df())
    
    print("\n=== RESULTS TABLE (general_results.parquet) ===")
    # Getting keys for a recent election to compare
    print(conn.execute("""
        SELECT "Code du département", "Code de la commune", "Code du b.vote" 
        FROM '/data/Election/general_results.parquet' 
        WHERE id_election LIKE '2022%' 
        LIMIT 5
    """).df())

    print("\n=== JOIN TEST (Inner Join Count) ===")
    # Naive join attempt
    query_join = """
        SELECT COUNT(*) 
        FROM bureaux b
        JOIN '/data/Election/general_results.parquet' r 
        ON b.id_bv = r."Code du b.vote" 
        AND b.codeCommune = r."Code de la commune"
        WHERE r.id_election = '2022_pres_t1'
    """
    count = conn.execute(query_join).fetchone()[0]
    print(f"Direct Join Matches: {count}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
