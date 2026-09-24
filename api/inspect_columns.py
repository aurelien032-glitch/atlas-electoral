import duckdb
try:
    conn = duckdb.connect('/data/transparence.duckdb')
    print("Schema:")
    print(conn.execute("DESCRIBE SELECT * FROM '/data/Election/general_results.parquet' LIMIT 1").df())
    
    print("\nCounting non-nulls per level for first election:")
    # Get one election
    eid = conn.execute("SELECT id_election FROM '/data/Election/general_results.parquet' LIMIT 1").fetchone()[0]
    print(f"Election: {eid}")
    # Check columns. Adjust names based on schema output if needed.
    # Assuming standard names for now to test.
    # We will use the schema output to write the real query.
except Exception as e:
    print(e)
