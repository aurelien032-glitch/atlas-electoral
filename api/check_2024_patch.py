import duckdb

CON = duckdb.connect()

def check_overlap():
    print("--- Checking Overlap 2024 vs 2022 ---")
    query = """
        WITH t2024 AS (
            SELECT DISTINCT id_brut_miom 
            FROM '/data/Election/general_results.parquet' 
            WHERE id_election = '2024_legi_t1'
        ),
        t2022 AS (
            SELECT DISTINCT id_brut_miom, "Code de la circonscription" as circo
            FROM '/data/Election/general_results.parquet' 
            WHERE id_election = '2022_legi_t1'
        )
        SELECT 
            COUNT(*) as total_2024,
            COUNT(t2022.circo) as matched_with_2022,
            (COUNT(t2022.circo) * 100.0 / COUNT(*)) as percentage_match
        FROM t2024
        LEFT JOIN t2022 ON t2024.id_brut_miom = t2022.id_brut_miom
    """
    try:
        res = CON.execute(query).fetchall()
        for r in res:
            print(f"Total 2024 Bureaus: {r[0]}")
            print(f"Matched with 2022: {r[1]}")
            print(f"Percentage: {r[2]:.2f}%")
            
        # Inspect unmatched
        print("\n--- Unmatched Samples ---")
        unmatched_query = """
            WITH t2024 AS (
                SELECT DISTINCT id_brut_miom 
                FROM '/data/Election/general_results.parquet' 
                WHERE id_election = '2024_legi_t1'
            ),
            t2022 AS (
                SELECT DISTINCT id_brut_miom, "Code de la circonscription" as circo
                FROM '/data/Election/general_results.parquet' 
                WHERE id_election = '2022_legi_t1'
            )
            SELECT t2024.id_brut_miom 
            FROM t2024 
            LEFT JOIN t2022 ON t2024.id_brut_miom = t2022.id_brut_miom
            WHERE t2022.circo IS NULL
            LIMIT 5
        """
        res = CON.execute(unmatched_query).fetchall()
        for r in res:
            print(r[0])

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_overlap()
