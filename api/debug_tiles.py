import duckdb
import mercantile
from database import create_connection

try:
    print("Connecting to DB...")
    conn = create_connection()
    
    layer = "departements"
    z, x, y = 2, 1, 1
    
    print(f"Testing tile generation for {layer} z={z} x={x} y={y}")
    
    # Logic from tiles.py
    b = mercantile.xy_bounds(x, y, z)
    
    sql = f"""
        WITH tile_bounds AS (
            SELECT ST_Extent(ST_MakeEnvelope({b.left}, {b.bottom}, {b.right}, {b.top})) as bbox
        )
        SELECT ST_AsMVT(q, '{layer}') 
        FROM (
            SELECT 
                ST_AsMVTGeom(geom, bbox) AS geom,
                * EXCLUDE(geom, bbox, centroid)
            FROM {layer}, tile_bounds
            WHERE ST_Intersects(geom, bbox)
        ) q
    """
    
    print("Executing SQL...")
    res = conn.execute(sql).fetchone()
    print("Result obtained!")
    print(f"Bytes length: {len(res[0]) if res and res[0] else 0}")
    
except Exception as e:
    print(f"❌ Error reproducing tile: {e}")
    import traceback
    traceback.print_exc()
finally:
    try:
        conn.close()
    except:
        pass
