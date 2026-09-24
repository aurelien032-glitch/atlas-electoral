import duckdb

CON = duckdb.connect()

def inspect_legi():
    print("--- Inspecting Legislative Elections Data ---")
    query = """
        SELECT 
            id_election,
            COUNT(*) as total_rows,
            COUNT("Code de la circonscription") as count_circo_code,
            COUNT(NULLIF("Code de la circonscription", '')) as non_empty_circo,
            ANY_VALUE("Code de la circonscription") as sample_circo
        FROM '/data/Election/general_results.parquet'
        WHERE id_election LIKE '%_legi_%'
        GROUP BY id_election
        ORDER BY id_election DESC
        LIMIT 5
    """
    try:
        res = CON.execute(query).fetchall()
        for r in res:
            print(f"Election: {r[0]}")
            print(f"  Rows: {r[1]}")
            print(f"  Circo Columns Present: {r[2]}")
            print(f"  Non-Empty Circo: {r[3]}")
            print(f"  Sample: {r[4]}")
            print("-" * 20)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_legi()
