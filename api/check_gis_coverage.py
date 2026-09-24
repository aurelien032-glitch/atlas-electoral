import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Checking REU vs GEO Overlay...")
    
    # 1. Total REU IDs
    nb_reu = conn.execute("SELECT COUNT(DISTINCT id_brut_reu) FROM '/data/Election/table-bv-reu.parquet'").fetchone()[0]
    print(f"Total Unique REU IDs: {nb_reu}")
    
    # 2. Total Geo IDs
    nb_geo = conn.execute("SELECT COUNT(DISTINCT id_bv) FROM bureaux").fetchone()[0]
    print(f"Total Unique Geo IDs: {nb_geo}")
    
    # 3. Intersection
    nb_match = conn.execute("""
        SELECT COUNT(DISTINCT t.id_brut_reu)
        FROM '/data/Election/table-bv-reu.parquet' t
        JOIN bureaux b ON t.id_brut_reu = b.id_bv
    """).fetchone()[0]
    print(f"REU IDs present in Geo: {nb_match}")
    print(f"Missing from Geo: {nb_reu - nb_match} ({round((nb_reu - nb_match)/nb_reu*100, 2)}%)")
    
    # 4. Check for a specific election (2002)
    print("\nDeep dive 2002 Pres T1:")
    # Results -> REU matches
    nb_res_reu = conn.execute("""
        SELECT COUNT(DISTINCT r.id_brut_miom)
        FROM '/data/Election/general_results.parquet' r
        JOIN '/data/Election/table-bv-reu.parquet' t ON r.id_brut_miom = t.id_brut_miom
        WHERE r.id_election = '2002_pres_t1'
    """).fetchone()[0]
    
    # Results -> REU -> Geo matches
    nb_res_geo = conn.execute("""
        SELECT COUNT(DISTINCT r.id_brut_miom)
        FROM '/data/Election/general_results.parquet' r
        JOIN '/data/Election/table-bv-reu.parquet' t ON r.id_brut_miom = t.id_brut_miom
        JOIN bureaux b ON t.id_brut_reu = b.id_bv
        WHERE r.id_election = '2002_pres_t1'
    """).fetchone()[0]
    
    print(f"Results matching REU: {nb_res_reu}")
    print(f"Results matching REU AND Geo: {nb_res_geo}")
    print(f"Lost due to missing Geometry: {nb_res_reu - nb_res_geo}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
