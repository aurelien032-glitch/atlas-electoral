import duckdb
from database import create_connection

try:
    conn = create_connection()
    
    test_dept = "01"
    
    print(f"=== Full Key Overlap Check for Dept {test_dept} ===")
    
    # Get ALL geo keys for dept
    geo_keys = conn.execute(f"""
        SELECT DISTINCT codeCommune FROM communes WHERE codeDepartement = '{test_dept}'
    """).fetchall()
    geo_set = set(r[0] for r in geo_keys)
    print(f"Geo Communes Count: {len(geo_set)}")
    print(f"Geo Sample: {list(geo_set)[:5]}")
    
    # Get ALL results keys for dept
    results_keys = conn.execute(f"""
        SELECT DISTINCT LPAD("Code du département", 2, '0') || LPAD("Code de la commune", 3, '0') as code
        FROM '/data/Election/general_results.parquet'
        WHERE id_election = '2024_legi_t1' AND "Code du département" = '{test_dept}'
    """).fetchall()
    results_set = set(r[0] for r in results_keys)
    print(f"Results Communes Count: {len(results_set)}")
    print(f"Results Sample: {list(results_set)[:5]}")
    
    # Check overlap
    overlap = geo_set.intersection(results_set)
    print(f"\nOverlap Count: {len(overlap)}")
    print(f"Overlap Sample: {list(overlap)[:5]}")
    
    # Check missing from geo
    missing_geo = results_set - geo_set
    print(f"\nIn Results but NOT in Geo: {len(missing_geo)}")
    print(f"Missing Sample: {list(missing_geo)[:5]}")
    
    # Check missing from results
    missing_results = geo_set - results_set
    print(f"\nIn Geo but NOT in Results: {len(missing_results)}")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
