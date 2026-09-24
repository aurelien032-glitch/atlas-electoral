import duckdb

CON = duckdb.connect()

def inspect_columns():
    print("--- Inspecting Columns for 2024_legi_t1 ---")
    # Get one row to see columns
    query = "DESCRIBE SELECT * FROM '/data/Election/general_results.parquet' WHERE id_election = '2024_legi_t1' LIMIT 1"
    try:
        res = CON.execute(query).fetchall()
        for r in res:
            print(f"Column: {r[0]} (Type: {r[1]})")
    except Exception as e:
        print(f"Error: {e}")

    print("\n--- Inspecting First Row Values ---")
    query = "SELECT * FROM '/data/Election/general_results.parquet' WHERE id_election = '2024_legi_t1' LIMIT 1"
    try:
        # We need to print dict to match values to keys if columns are many
        # But fetchdf is not available in raw script context easily without pandas installed in image?
        # Let's just print raw tuple and hope order matches
        res = CON.execute(query).fetchone()
        print(res)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_columns()
