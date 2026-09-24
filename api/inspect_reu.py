import duckdb

CON = duckdb.connect()

def inspect_reu():
    print("--- Inspecting REU Table ---")
    query = "DESCRIBE SELECT * FROM '/data/Election/table-bv-reu.parquet' LIMIT 1"
    try:
        res = CON.execute(query).fetchall()
        for r in res:
            print(f"Column: {r[0]} (Type: {r[1]})")
            
        print("\n--- Rows Sample ---")
        res = CON.execute("SELECT * FROM '/data/Election/table-bv-reu.parquet' LIMIT 3").fetchall()
        for r in res:
            print(r)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_reu()
