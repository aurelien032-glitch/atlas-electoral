import duckdb

con = duckdb.connect()
files = [
    "/data/Election/general_results.parquet",
    "/data/Election/candidats_results.parquet",
    "/data/Election/table-bv-reu.parquet"
]

for f in files:
    print(f"--- Schema of {f} ---")
    try:
        con.execute(f"DESCRIBE SELECT * FROM '{f}'")
        print(con.fetchall())
        print("\nSAMPLE DATA:")
        con.execute(f"SELECT * FROM '{f}' LIMIT 3")
        print(con.fetchall())
    except Exception as e:
        print(f"Error reading {f}: {e}")
    print("\n")
