import duckdb
try:
    conn = duckdb.connect('/data/transparence.duckdb')
    print("Election IDs:")
    rows = conn.execute("SELECT DISTINCT id_election FROM '/data/Election/general_results.parquet'").fetchall()
    for r in rows:
        print(r[0])
except Exception as e:
    print(e)
