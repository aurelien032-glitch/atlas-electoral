import duckdb
from database import create_connection

try:
    conn = create_connection()
    # Check 2024 Legi T2
    eid = '2024_legi_t2'
    query = f"""
        SELECT 
            id_election, 
            COUNT(NULLIF("Code du b.vote", '')) as nb_bureaux,
            COUNT(NULLIF("Code de la commune", '')) as nb_communes,
            COUNT(NULLIF("Code de la circonscription", '')) as nb_circos
        FROM '/data/Election/general_results.parquet'
        WHERE id_election = '{eid}'
        GROUP BY id_election
    """
    res = conn.execute(query).df()
    print(f"Counts for {eid}:")
    print(res)
    
    # Also check if any bureaux exist in the geo table for a sample commune
    # E.g. commune '01001'
    print("\nChecking Geo Table for commune 01001:")
    res_geo = conn.execute("SELECT id_bv, codeCommune FROM bureaux WHERE codeCommune = '01001' LIMIT 5").df()
    print(res_geo)
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
