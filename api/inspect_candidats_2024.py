import duckdb

CON = duckdb.connect()

def inspect_candidats():
    print("--- Inspecting Candidates Table for 2024_legi_t1 ---")
    query = "DESCRIBE SELECT * FROM '/data/Election/candidats_results.parquet' WHERE id_election = '2024_legi_t1' LIMIT 1"
    try:
        res = CON.execute(query).fetchall()
        for r in res:
            print(f"Column: {r[0]} (Type: {r[1]})")
            
        print("\n--- Rows Sample ---")
        res = CON.execute("SELECT * FROM '/data/Election/candidats_results.parquet' WHERE id_election = '2024_legi_t1' LIMIT 1").fetchall()
        for r in res:
            # Print as dict for identifying values
            print(r)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_candidats()
