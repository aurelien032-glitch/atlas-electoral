#!/usr/bin/env python3
"""
Pre-calculate simplified geometries for different zoom levels.
This script creates tables with pre-simplified geometries to improve tile generation performance.
"""

import duckdb
import os
import sys

# Configuration des niveaux de zoom par layer
LAYER_CONFIG = {
    'departements': [
        {'name': 'departements_z0_8', 'tolerance': 0, 'min_z': 0, 'max_z': 8},
        {'name': 'departements_z9_12', 'tolerance': 0, 'min_z': 9, 'max_z': 12},
    ],
    'circonscriptions': [
        {'name': 'circonscriptions_z0_8', 'tolerance': 0, 'min_z': 0, 'max_z': 8},
        {'name': 'circonscriptions_z9_11', 'tolerance': 0, 'min_z': 9, 'max_z': 11},
        {'name': 'circonscriptions_z12_14', 'tolerance': 0, 'min_z': 12, 'max_z': 14},
    ],
    'communes': [
        {'name': 'communes_z0_9', 'tolerance': 0, 'min_z': 0, 'max_z': 9},
        {'name': 'communes_z10_12', 'tolerance': 0, 'min_z': 10, 'max_z': 12},
        {'name': 'communes_z13_15', 'tolerance': 0, 'min_z': 13, 'max_z': 15},
    ],
    'bureaux': [
        {'name': 'bureaux_z0_11', 'tolerance': 0, 'min_z': 0, 'max_z': 11},
        {'name': 'bureaux_z12_14', 'tolerance': 0, 'min_z': 12, 'max_z': 14},
        {'name': 'bureaux_z15_18', 'tolerance': 0, 'min_z': 15, 'max_z': 18},
    ],
}

# Colonnes à conserver par layer
LAYER_COLUMNS = {
    'departements': 'codeDepartement, nomDepartement',
    'circonscriptions': 'codeCirconscription, nomCirconscription, codeDepartement',
    'communes': 'codeCommune, nomCommune, codeDepartement, codeCirconscription',
    'bureaux': 'id_bv, codeCommune, nomCommune, codeDepartement, codeCirconscription',
}


def get_db_path():
    """Get database path from environment or default."""
    return os.getenv("DUCKDB_PATH", "consolidated.duckdb")


def create_simplified_tables(conn: duckdb.DuckDBPyConnection, layer: str, force: bool = False):
    """Create simplified geometry tables for a given layer."""
    
    if layer not in LAYER_CONFIG:
        print(f"[ERROR] Unknown layer: {layer}")
        return
    
    columns = LAYER_COLUMNS.get(layer, '*')
    configs = LAYER_CONFIG[layer]
    
    for config in configs:
        table_name = config['name']
        tolerance = config['tolerance']
        
        # Check if table exists
        if not force:
            try:
                conn.execute(f"SELECT 1 FROM {table_name} LIMIT 1")
                print(f"[SKIP] Table {table_name} already exists, skipping...")
                continue
            except:
                pass
        
        print(f"[BUILD] Creating {table_name} (tolerance={tolerance}m)...")
        
        try:
            # Drop if forcing rebuild
            if force:
                conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            
            # Create simplified geometry table
            if tolerance > 0:
                sql = f"""
                    CREATE TABLE {table_name} AS 
                    SELECT {columns},
                           ST_SimplifyPreserveTopology(geom, {tolerance}) as geom
                    FROM {layer}
                    WHERE geom IS NOT NULL
                """
            else:
                # No simplification for high zoom levels
                sql = f"""
                    CREATE TABLE {table_name} AS 
                    SELECT {columns}, geom
                    FROM {layer}
                    WHERE geom IS NOT NULL
                """
            
            conn.execute(sql)
            
            # Count rows
            count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"   [OK] Created with {count} rows")
            
            # Validate geometries
            invalid = conn.execute(f"SELECT COUNT(*) FROM {table_name} WHERE NOT ST_IsValid(geom)").fetchone()[0]
            if invalid > 0:
                print(f"   [WARN] {invalid} invalid geometries found, attempting repair...")
                conn.execute(f"""
                    UPDATE {table_name} 
                    SET geom = ST_MakeValid(geom) 
                    WHERE NOT ST_IsValid(geom)
                """)
            
        except Exception as e:
            print(f"   [ERROR] Error creating {table_name}: {e}")


def create_spatial_indexes(conn: duckdb.DuckDBPyConnection):
    """Create spatial indexes for all simplified tables."""
    print("\n[INDEX] Creating spatial indexes...")
    
    for layer, configs in LAYER_CONFIG.items():
        for config in configs:
            table_name = config['name']
            try:
                # Check if table exists
                conn.execute(f"SELECT 1 FROM {table_name} LIMIT 1")
                
                # Create RTREE index for efficient spatial querying
                print(f"   [BUILD] Creating RTREE index for {table_name}...")
                conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_geom ON {table_name} USING RTREE (geom)")
                print(f"   [OK] Index created")
                
            except Exception as e:
                print(f"   [WARN] Skipping {table_name}: {e}")


def create_zoom_mapping_table(conn: duckdb.DuckDBPyConnection):
    """Create a helper table to map zoom levels to simplified tables."""
    print("\n[MAP] Creating zoom mapping table...")
    
    conn.execute("DROP TABLE IF EXISTS tile_zoom_mapping")
    conn.execute("""
        CREATE TABLE tile_zoom_mapping (
            layer VARCHAR,
            simplified_table VARCHAR,
            min_zoom INTEGER,
            max_zoom INTEGER
        )
    """)
    
    for layer, configs in LAYER_CONFIG.items():
        for config in configs:
            conn.execute(f"""
                INSERT INTO tile_zoom_mapping VALUES 
                ('{layer}', '{config['name']}', {config['min_z']}, {config['max_z']})
            """)
    
    print("   [OK] Zoom mapping table created")


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Pre-calculate simplified geometries for tile generation')
    parser.add_argument('--force', action='store_true', help='Force recreation of all tables')
    parser.add_argument('--layer', type=str, help='Only process specific layer (departements, circonscriptions, communes, bureaux)')
    args = parser.parse_args()
    
    db_path = get_db_path()
    print(f"[DB] Connecting to {db_path}...")
    
    conn = duckdb.connect(db_path, read_only=False)
    conn.execute("INSTALL spatial; LOAD spatial;")
    
    try:
        # Process layers
        layers = [args.layer] if args.layer else ['departements', 'circonscriptions', 'communes', 'bureaux']
        
        for layer in layers:
            print(f"\n{'='*50}")
            print(f"Processing layer: {layer.upper()}")
            print('='*50)
            create_simplified_tables(conn, layer, force=args.force)
        
        # Create indexes and mapping
        create_spatial_indexes(conn)
        create_zoom_mapping_table(conn)
        
        print("\n[DONE] Pre-calculation complete!")
        
        # Show summary
        print("\n[SUMMARY]:")
        for layer, configs in LAYER_CONFIG.items():
            for config in configs:
                try:
                    count = conn.execute(f"SELECT COUNT(*) FROM {config['name']}").fetchone()[0]
                    print(f"   {config['name']}: {count} rows")
                except:
                    print(f"   {config['name']}: NOT CREATED")
        
    finally:
        conn.close()


if __name__ == "__main__":
    main()
