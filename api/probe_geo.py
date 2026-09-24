
import duckdb
import os

DB_PATH = '/app/storage/consolidated.duckdb'
# Coordinates for a tile in Central France (approx Dept 18/Cher)
# Zoom 6.
# 6/32/22 covers France.
# Let's try to simulate the query used in tiles.py
# bounds for 6/32/22 (Mercator)
# West: 0.0, South: 40.9, East: 11.25, North: 48.9 (Approx)
# Actually let's use a simpler query to check if ANY data exists in 'departements' with Valid Geoms.

print(f"Connecting to {DB_PATH}...")
try:
    con = duckdb.connect(DB_PATH, read_only=True)
    con.install_extension('spatial')
    con.load_extension('spatial')
    
    print("Checking Departements table...")
    count = con.execute("SELECT COUNT(*) FROM departements").fetchone()[0]
    print(f"Row count: {count}")
    
    print("Checking Geometry Validity...", flush=True)
    # Sample one wkt
    wkt = con.execute("SELECT ST_AsText(geom) FROM departements LIMIT 1").fetchone()
    print(f"Sample Geom: {str(wkt)[:100]}...", flush=True)

    # Check Bounds of data
    extent = con.execute("SELECT ST_Extent(geom) FROM departements").fetchall()
    print(f"Data Extent: {extent}", flush=True)
    
    # Try MVT generation manually for a broad box
    # 3857 bounds for France approx: -600000, 5000000, 1000000, 6600000
    mvt_query = """
    SELECT length(ST_AsMVT(q)) 
    FROM (
        SELECT codeDepartement, ST_AsMVTGeom(geom, ST_MakeEnvelope(-5, 41, 10, 52)) AS geom
        FROM departements
    ) q
    """
    # Note: Envelope in 4326 for simplicity if data is 4326?
    # Wait, the data usually comes as 3857 or 4326.
    # contour-france-entiere is likely 4326 (WGS84).
    # ST_AsMVTGeom expects 3857 usually or transforms? 
    # Actually DuckDB spatial docs say ST_AsMVTGeom transforms input to tile coordinate space.
    # The bounds passed to ST_MakeEnvelope/Transform matter.
    
    # Let's just check the SRS of the data first.
    # srs = con.execute("SELECT ST_SRID(geom) FROM departements LIMIT 1").fetchone()
    # print(f"SRID: {srs}")
    
except Exception as e:
    print(f"PROBE ERROR: {e}")
