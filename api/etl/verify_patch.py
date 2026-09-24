import duckdb

CON = duckdb.connect("consolidated.duckdb")

def verify_etl():
    print("--- Verifying ETL Patch for 2024 ---")
    query = """
        SELECT 
            id_election,
            COUNT(*) as distinct_circos,
            SUM(inscrits) as total_inscrits
        FROM fact_results
        WHERE level = 'circonscription' AND id_election LIKE '2024_legi%'
        GROUP BY id_election
    """
    try:
        res = CON.execute(query).fetchall()
        for r in res:
            print(f"Election: {r[0]}")
            print(f"  Circos Found: {r[1]}")
            print(f"  Total Inscrits: {r[2]}")
            
        if len(res) == 0:
            print("❌ No 2024 Legi Circo data found!")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    verify_etl()
