import duckdb
import csv
import sys
from database import create_connection

OUTPUT_FILE = "gis_audit.csv"

def audit_links():
    try:
        conn = create_connection()
        print("Starting GIS Link Audit...")
        
        # 1. Get all elections
        query_elections = "SELECT DISTINCT id_election FROM '/data/Election/general_results.parquet' ORDER BY id_election DESC"
        elections = [r[0] for r in conn.execute(query_elections).fetchall()]
        
        results = []
        
        for eid in elections:
            print(f"Analyzing {eid}...")
            
            # Analyze Basic Code Availability
            query_counts = f"""
                SELECT 
                    COUNT(NULLIF("Code du département", '')) as nb_dept,
                    COUNT(NULLIF("Code de la circonscription", '')) as nb_circo,
                    COUNT(NULLIF("Code de la commune", '')) as nb_commune,
                    COUNT(NULLIF("Code du b.vote", '')) as nb_bureau
                FROM '/data/Election/general_results.parquet'
                WHERE id_election = '{eid}'
            """
            counts = conn.execute(query_counts).fetchone()
            nb_dept, nb_circo, nb_commune, nb_bureau = counts
            
            # Analyze Bureau Map Link (JOIN with REU)
            # We count distinct bureau codes in the results that successfully join
            query_join = f"""
                SELECT COUNT(*)
                FROM '/data/Election/general_results.parquet' r 
                JOIN '/data/Election/table-bv-reu.parquet' t 
                ON r.id_brut_miom = t.id_brut_miom
                WHERE r.id_election = '{eid}'
            """
            nb_map_link = conn.execute(query_join).fetchone()[0]
            
            # Percentage of bureaus mapped
            coverage_pct = 0.0
            if nb_bureau > 0:
                coverage_pct = round((nb_map_link / nb_bureau) * 100, 2)
            
            results.append({
                "id_election": eid,
                "has_dept_level": nb_dept > 0,
                "has_circo_level": nb_circo > 0,
                "has_commune_level": nb_commune > 0,
                "has_bureau_data": nb_bureau > 0,
                "bureau_data_count": nb_bureau,
                "bureau_map_matches": nb_map_link,
                "bureau_coverage_pct": coverage_pct,
                "visualizable_levels": [] # Helper
            })
            
        print(f"Writing results to {OUTPUT_FILE}...")
        
        with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            # Header
            writer.writerow([
                "Election ID", "Departement Link", "Circonscription Link", 
                "Commune Link", "Bureau Data Present", "Bureau Map Matches", "Bureau Coverage %"
            ])
            
            for r in results:
                writer.writerow([
                    r["id_election"],
                    "YES" if r["has_dept_level"] else "NO",
                    "YES" if r["has_circo_level"] else "NO",
                    "YES" if r["has_commune_level"] else "NO",
                    "YES" if r["has_bureau_data"] else "NO",
                    r["bureau_map_matches"],
                    f"{r['bureau_coverage_pct']}%"
                ])
                
        print("Audit Complete.")
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    audit_links()
