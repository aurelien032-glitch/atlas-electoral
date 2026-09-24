
import requests
import json
import duckdb

API_URL = "http://localhost:8000"  # Direct to API

def check_data_alignment(election_id: str, level: str):
    print(f"\n--- Checking alignment for {level} (Election: {election_id}) ---")
    
    # 1. Fetch Winners Data
    print("Fetching winners...")
    try:
        r = requests.get(f"{API_URL}/elections/{election_id}/winners", params={"level": level})
        r.raise_for_status()
        winners = r.json()
        winner_codes = set(str(w['code']) for w in winners)
        print(f"[OK] Got {len(winners)} winner records. Sample codes: {list(winner_codes)[:5]}")
    except Exception as e:
        print(f"[ERR] Failed to fetch winners: {e}")
        return

    # 2. Fetch Sample Tile features (Geo Codes)
    print("Fetching sample tile features from DB...")
    # We'll valid codes directly from DB to simulate what's in the tiles
    conn = duckdb.connect('api/consolidated.duckdb')
    try:
        # Determine table and column
        table = level
        if level == "bureaux": table = "bureaux_z12_14" # Sample optimized table
        elif level == "communes": table = "communes_z10_12"
        elif level == "departement": table = "departements_z0_8" # Fix table name mapping
        elif level == "circonscription": table = "circonscriptions_z0_8"
        
        col_map = {
            "departement": "codeDepartement",
            "circonscription": "codeCirconscription",
            "communes": "codeCommune",
            "commune": "codeCommune",
            "bureaux": "id_bv",
            "bureau": "id_bv"
        }
        
        col = col_map.get(level, "code")
        
        # Determine how MapViz constructs the key
        query = f"SELECT DISTINCT {col} FROM {table} LIMIT 100"
        try:
             geo_rows = conn.execute(query).fetchall()
        except Exception as e:
             # Retry with plural table name if singular failed
             if "Table with name" in str(e):
                 table = table + "s"
                 query = f"SELECT DISTINCT {col} FROM {table} LIMIT 100"
                 geo_rows = conn.execute(query).fetchall()
             else:
                 raise e
                 
        geo_codes = set(str(r[0]) for r in geo_rows)
        print(f"[OK] Got sample geo codes from {table}.{col}: {list(geo_codes)[:5]}")
        
        # 3. Compare overlap
        common = winner_codes.intersection(geo_codes)
        print(f"[INFO] Overlap: {len(common)} codes match out of {len(geo_codes)} geo sample.")
        
        missing_in_winners = geo_codes - winner_codes
        if missing_in_winners:
            print(f"[WARN] Geo codes missing in Winners: {list(missing_in_winners)[:5]}")
            
        # format check
        w_sample = next(iter(winner_codes)) if winner_codes else "N/A"
        g_sample = next(iter(geo_codes)) if geo_codes else "N/A"
        print(f"[Check] Format: Winner '{w_sample}' vs Geo '{g_sample}'")
        
    finally:
        conn.close()

if __name__ == "__main__":
    # Get first election to test
    try:
        elections = requests.get(f"{API_URL}/elections/").json()['elections']
        if elections:
            eid = elections[0]['id']
            # Test key levels
            check_data_alignment(eid, "departement")
            check_data_alignment(eid, "circonscription") 
            # Note: API uses singular 'circonscription', Tiles use 'circonscriptions'
            check_data_alignment(eid, "commune")
    except Exception as e:
        print(f"Init failed: {e}")
