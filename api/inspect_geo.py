import duckdb

con = duckdb.connect()
con.execute("INSTALL spatial; LOAD spatial;")
files = [
    "/data/Map/contours-france-entiere-latest-v2.geojson"
]

# Note: reading broad geojson with duckdb might treat it as a single row if feature collection.
# But ST_Read can handle it. Or just read_json_auto and look at features.
for f in files:
    print(f"--- Features of {f} ---")
    try:
        # Limit to 1 feature to see properties
        # We assume it's a FeatureCollection
        q = f"SELECT * FROM ST_Read('{f}') LIMIT 1"
        con.execute(q)
        print(con.fetchall())
        
        # Also describe table
        con.execute(f"DESCRIBE SELECT * FROM ST_Read('{f}')")
        print(con.fetchall())

    except Exception as e:
        print(f"Error reading {f}: {e}")
    print("\n")
