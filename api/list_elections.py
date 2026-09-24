import duckdb
conn = duckdb.connect()
print(conn.execute("SELECT DISTINCT id_election FROM '/data/Election/general_results.parquet' ORDER BY id_election").fetchall())
