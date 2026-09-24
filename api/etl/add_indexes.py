
import duckdb
import os

# Configuration matching precalc_geometries.py
LAYER_CONFIG = {
    'departements': ['departements_z0_8', 'departements_z9_12'],
    'circonscriptions': ['circonscriptions_z0_8', 'circonscriptions_z9_11', 'circonscriptions_z12_14'],
    'communes': ['communes_z0_9', 'communes_z10_12', 'communes_z13_15'],
    'bureaux': ['bureaux_z0_11', 'bureaux_z12_14', 'bureaux_z15_18'],
}

def get_db_path():
    return os.getenv("DUCKDB_PATH", "consolidated.duckdb")

def main():
    db_path = get_db_path()
    print(f"[DB] Connecting to {db_path}...")
    conn = duckdb.connect(db_path, read_only=False)
    conn.execute("INSTALL spatial; LOAD spatial;")
    
    try:
        for layer, tables in LAYER_CONFIG.items():
            print(f"\nProcessing layer: {layer}")
            for table in tables:
                print(f"  Checking {table}...")
                try:
                    # Check if table exists
                    conn.execute(f"SELECT 1 FROM {table} LIMIT 1")
                    
                    # Create Index
                    index_name = f"idx_{table}_geom"
                    print(f"    Creating RTREE index {index_name}...")
                    conn.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} USING RTREE (geom)")
                    print("    [OK] Index created")
                    
                except Exception as e:
                    print(f"    [ERR] Error: {e}")
                    
    finally:
        conn.close()

if __name__ == "__main__":
    main()
