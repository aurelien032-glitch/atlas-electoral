import duckdb

def check_mvt():
    conn = duckdb.connect()
    try:
        conn.execute("INSTALL spatial; LOAD spatial;")
        # Check if ST_AsMVT is in the function list or if we can run a dummy query
        try:
            # Try to start a query using ST_AsMVT
            # Note: ST_AsMVT usage usually requires a subquery or specific structure, 
            # but checking existence in duckdb_functions() is safer.
            res = conn.execute("SELECT function_name FROM duckdb_functions() WHERE function_name = 'ST_AsMVT'").fetchall()
            if res:
                print("ST_AsMVT is supported")
            else:
                print("ST_AsMVT is NOT supported (not found in functions)")
        except Exception as e:
            print(f"Error checking function: {e}")
    except Exception as e:
        print(f"Error loading spatial: {e}")

if __name__ == "__main__":
    check_mvt()
