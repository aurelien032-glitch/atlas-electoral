from fastapi import APIRouter, Depends, HTTPException, Response
from database import get_db_connection
import duckdb
import mercantile
import os
import hashlib

router = APIRouter(prefix="/tiles", tags=["tiles"])

# Cache directory for pre-generated tiles
TILE_CACHE_DIR = os.getenv("TILE_CACHE_DIR", "tiles")

# Mapping of layers to simplified table names by zoom level
SIMPLIFIED_TABLES = {
    'departements': [
        {'table': 'departements_z0_8', 'min_z': 0, 'max_z': 8},
        {'table': 'departements_z9_12', 'min_z': 9, 'max_z': 12},
        {'table': 'departements', 'min_z': 13, 'max_z': 18},  # Original for high zoom
    ],
    'circonscriptions': [
        {'table': 'circonscriptions_z0_8', 'min_z': 0, 'max_z': 8},
        {'table': 'circonscriptions_z9_11', 'min_z': 9, 'max_z': 11},
        {'table': 'circonscriptions_z12_14', 'min_z': 12, 'max_z': 14},
        {'table': 'circonscriptions', 'min_z': 15, 'max_z': 18},
    ],
    'communes': [
        {'table': 'communes_z0_9', 'min_z': 0, 'max_z': 9},
        {'table': 'communes_z10_12', 'min_z': 10, 'max_z': 12},
        {'table': 'communes_z13_15', 'min_z': 13, 'max_z': 15},
        {'table': 'communes', 'min_z': 16, 'max_z': 18},
    ],
    'bureaux': [
        {'table': 'bureaux_z0_11', 'min_z': 0, 'max_z': 11},
        {'table': 'bureaux_z12_14', 'min_z': 12, 'max_z': 14},
        {'table': 'bureaux_z15_18', 'min_z': 15, 'max_z': 18},
    ],
}


def get_simplified_table(layer: str, zoom: int, conn=None) -> str:
    """Get the appropriate simplified table for the given layer and zoom level.
    Falls back to original table if simplified doesn't exist."""
    if layer not in SIMPLIFIED_TABLES:
        return layer
    
    for config in SIMPLIFIED_TABLES[layer]:
        if config['min_z'] <= zoom <= config['max_z']:
            target_table = config['table']
            # Check if simplified table exists (with fallback)
            if conn and target_table != layer:
                try:
                    conn.execute(f"SELECT 1 FROM {target_table} LIMIT 1")
                except:
                    # Simplified table doesn't exist, fall back to original
                    print(f"Simplified table {target_table} not found, using {layer}")
                    return layer
            return target_table
    
    return layer  # Fallback to original table


def get_cache_path(layer: str, z: int, x: int, y: int, filter_hash: str) -> str:
    """Generate cache file path for a tile."""
    return os.path.join(TILE_CACHE_DIR, layer, str(z), str(x), f"{y}_{filter_hash}.mvt")


def get_filter_hash(code_departement: str, code_circonscription: str, code_commune: str) -> str:
    """Generate a hash for filter parameters to use in cache key."""
    filter_str = f"{code_departement or ''}-{code_circonscription or ''}-{code_commune or ''}"
    if filter_str == "--":
        return "all"
    return hashlib.md5(filter_str.encode()).hexdigest()[:8]


def read_cached_tile(cache_path: str) -> bytes | None:
    """Read tile from cache if it exists."""
    if os.path.exists(cache_path):
        with open(cache_path, 'rb') as f:
            return f.read()
    return None


def write_cached_tile(cache_path: str, content: bytes):
    """Write tile to cache."""
    try:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, 'wb') as f:
            f.write(content)
    except Exception as e:
        print(f"Cache write error: {e}")


@router.get("/{layer}/{z}/{x}/{y}", response_class=Response)
def get_tile(
    layer: str,
    z: int,
    x: int,
    y: int,
    code_departement: str = None,
    code_circonscription: str = None,
    code_commune: str = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Serve Vector Tiles (MVT) for a specific layer.
    Uses pre-simplified geometry tables for better performance.
    """
    allowed_layers = ["departements", "circonscriptions", "communes", "bureaux"]
    if layer not in allowed_layers:
        raise HTTPException(404, "Layer not found")

    # Generate cache key
    filter_hash = get_filter_hash(code_departement, code_circonscription, code_commune)
    cache_path = get_cache_path(layer, z, x, y, filter_hash)
    
    # Try to read from cache
    cached = read_cached_tile(cache_path)
    if cached is not None:
        return Response(
            content=cached, 
            media_type="application/vnd.mapbox-vector-tile",
            headers={"Cache-Control": "public, max-age=86400"}  # 24h cache
        )

    # Get the appropriate simplified table for this zoom level
    source_table = get_simplified_table(layer, z, conn)

    # Filters
    where_clauses = []
    if code_departement:
        where_clauses.append(f"codeDepartement = '{code_departement}'")
    if code_circonscription:
        where_clauses.append(f"codeCirconscription = '{code_circonscription}'")
    if code_commune:
        where_clauses.append(f"codeCommune = '{code_commune}'")

    where_sql = f"WHERE {' AND '.join(where_clauses) + ' AND' if where_clauses else ''}"

    # Tile bounds in Web Mercator (EPSG:3857)
    b = mercantile.xy_bounds(x, y, z)

    # No more dynamic simplification - geometry is already pre-simplified
    sql = f"""
        WITH tile_bounds AS (
            SELECT ST_Extent(ST_MakeEnvelope({b.left}, {b.bottom}, {b.right}, {b.top})) as bbox
        )
        SELECT ST_AsMVT(q, '{layer}') 
        FROM (
            SELECT 
                ST_AsMVTGeom(geom, bbox, 8192) AS geom,
                * EXCLUDE(geom, bbox)
            FROM {source_table}, tile_bounds
            {where_sql} ST_Intersects(geom, bbox)
        ) q
    """

    try:
        res = conn.execute(sql).fetchone()
        if res and res[0]:
            content = bytes(res[0])
            # Cache the tile
            write_cached_tile(cache_path, content)
            return Response(
                content=content, 
                media_type="application/vnd.mapbox-vector-tile",
                headers={"Cache-Control": "public, max-age=86400"}
            )
        else:
            return Response(
                content=b"", 
                media_type="application/vnd.mapbox-vector-tile",
                headers={"Cache-Control": "public, max-age=3600"}  # 1h for empty tiles
            )

    except Exception as e:
        print(f"Tile Error for {source_table}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))


@router.delete("/cache")
def clear_tile_cache():
    """Clear all cached tiles."""
    import shutil
    try:
        if os.path.exists(TILE_CACHE_DIR):
            shutil.rmtree(TILE_CACHE_DIR)
        return {"status": "cache cleared"}
    except Exception as e:
        raise HTTPException(500, f"Failed to clear cache: {e}")


@router.delete("/cache/{layer}")
def clear_layer_cache(layer: str):
    """Clear cached tiles for a specific layer."""
    import shutil
    layer_cache = os.path.join(TILE_CACHE_DIR, layer)
    try:
        if os.path.exists(layer_cache):
            shutil.rmtree(layer_cache)
        return {"status": f"cache cleared for {layer}"}
    except Exception as e:
        raise HTTPException(500, f"Failed to clear cache: {e}")
