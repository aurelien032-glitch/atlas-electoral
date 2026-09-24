import duckdb
from database import create_connection

try:
    conn = create_connection()
    election_id = '2002_pres_t1'
    
    print(f"=== Testing Direct Linkage for {election_id} ===")
    
    # 1. Total unique id_brut_miom in results
    total_results = conn.execute(f"SELECT COUNT(DISTINCT id_brut_miom) FROM '/data/Election/general_results.parquet' WHERE id_election = '{election_id}'").fetchone()[0]
    print(f"Unique Bureau IDs in Results (id_brut_miom): {total_results}")
    
    # 2. Check overlap with GIS 'codeBureauVote'
    ov_code_bv = conn.execute(f"""
        SELECT COUNT(DISTINCT r.id_brut_miom)
        FROM '/data/Election/general_results.parquet' r
        JOIN bureaux b ON r.id_brut_miom = b.codeBureauVote
        WHERE r.id_election = '{election_id}'
    """).fetchone()[0]
    print(f"Match results.id_brut_miom == bureaux.codeBureauVote: {ov_code_bv} ({round(ov_code_bv/total_results*100, 2)}%)")
    
    # 3. Compare with current REU JOIN
    ov_reu = conn.execute(f"""
        SELECT COUNT(DISTINCT r.id_brut_miom)
        FROM '/data/Election/general_results.parquet' r
        JOIN '/data/Election/table-bv-reu.parquet' t ON r.id_brut_miom = t.id_brut_miom
        JOIN bureaux b ON t.id_brut_reu = b.id_bv
        WHERE r.id_election = '{election_id}'
    """).fetchone()[0]
    print(f"Match via REU Table (current): {ov_reu} ({round(ov_reu/total_results*100, 2)}%)")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
