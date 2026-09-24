import duckdb
from database import create_connection

try:
    conn = create_connection()
    
    # Test for Department 01 (Ain)
    test_dept = "01"
    
    print(f"=== GEO LAYER: Communes for Dept {test_dept} ===")
    geo_query = f"""
        SELECT codeDepartement, codeCommune, nomCommune
        FROM communes 
        WHERE codeDepartement = '{test_dept}'
        LIMIT 10
    """
    geo_df = conn.execute(geo_query).df()
    print(geo_df)
    print(f"\nGeo Key Format Example: codeDept={geo_df['codeDepartement'].iloc[0]}, codeCommune={geo_df['codeCommune'].iloc[0]}")
    
    # Construct what the frontend would use as key
    frontend_key_example = str(geo_df['codeDepartement'].iloc[0]).zfill(2) + str(geo_df['codeCommune'].iloc[0]).zfill(3)
    print(f"Frontend Key Construction: {frontend_key_example}")
    
    print(f"\n=== RESULTS API: Communes for Dept {test_dept} ===")
    results_query = f"""
        SELECT 
            LPAD("Code du département", 2, '0') || LPAD("Code de la commune", 3, '0') as code,
            "Libellé de la commune" as name,
            SUM("Inscrits") as Inscrits
        FROM '/data/Election/general_results.parquet'
        WHERE id_election = '2024_legi_t1' AND "Code du département" = '{test_dept}'
        GROUP BY "Code du département", "Code de la commune", "Libellé de la commune"
        LIMIT 10
    """
    results_df = conn.execute(results_query).df()
    print(results_df)
    print(f"\nResults Key Example: {results_df['code'].iloc[0]}")
    
    # Check if keys match
    frontend_keys = set(geo_df.apply(lambda r: str(r['codeDepartement']).zfill(2) + str(r['codeCommune']).zfill(3), axis=1))
    results_keys = set(results_df['code'])
    
    matches = frontend_keys.intersection(results_keys)
    print(f"\n=== KEY MATCH ANALYSIS ===")
    print(f"Frontend Keys Sample: {list(frontend_keys)[:5]}")
    print(f"Results Keys Sample: {list(results_keys)[:5]}")
    print(f"Matches in Sample: {len(matches)}")
    
    if len(matches) == 0:
        print("WARNING: NO MATCHES! Keys are incompatible.")
    else:
        print("OK: Keys match.")
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
