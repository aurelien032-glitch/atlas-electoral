import duckdb

try:
    conn = duckdb.connect('consolidated.duckdb')
    print("--- TABLES ---")
    print(conn.execute("SHOW TABLES").fetchall())
    
    print("\n--- SAMPLE fact_results (if exists) ---")
    try:
        print(conn.execute("SELECT * FROM fact_results LIMIT 1").fetchall())
    except:
        print("fact_results table not found")
        
    conn.close()
except Exception as e:
    print(e)
