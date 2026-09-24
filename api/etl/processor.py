import duckdb
import os

DB_PATH = "consolidated.duckdb"
RAW_RESULTS = "/data/Election/general_results.parquet"
RAW_CANDIDATES = "/data/Election/candidats_results.parquet"
SCHEMA_PATH = "etl/schema.sql"

def init_db(con):
    with open(SCHEMA_PATH, 'r') as f:
        con.execute(f.read())
    print("✅ Schema initialized.")

def load_elections_dim(con):
    print("⏳ Loading Dimensions...")
    # Extract unique election IDs and parse metadata
    query = f"""
        INSERT OR IGNORE INTO dim_elections
        SELECT DISTINCT
            id_election,
            id_election as label, -- To be prettified later or now
            CAST(SUBSTRING(id_election, 1, 4) AS INTEGER) as year,
            SPLIT_PART(id_election, '_', 2) as type,
            UPPER(SPLIT_PART(id_election, '_', 3)) as round,
            NULL as date_election
        FROM '{RAW_RESULTS}'
    """
    con.execute(query)
    print("✅ Dimensions loaded.")

def process_results(con):
    print("⏳ Processing Results (this may take time)...")
    
    # We process level by level to ensure clean codes
    
    # 1. DEPARTEMENTS
    print("   > Processing Departements...")
    con.execute(f"""
        INSERT OR IGNORE INTO fact_results
        SELECT 
            id_election,
            'departement' as level,
            LPAD("Code du département", 2, '0') as code_geo,
            ANY_VALUE("Libellé du département") as name_geo,
            SUM(Inscrits), SUM(Votants), SUM(Abstentions), SUM(Blancs), SUM(Nuls), SUM(Exprimés),
            NULL, NULL, NULL -- Winners to be updated later
        FROM '{RAW_RESULTS}'
        GROUP BY id_election, code_geo
    """)

    # 2. CIRCONSCRIPTIONS (With 2024 Patch)
    print("   > Processing Circonscriptions (Automatic Patching)...")
    
    # We use a UNION to handle the normal case vs the patched case
    # Normal case: Columns exist
    # Patched case: Join with 2022
    
    # Actually, easier to create a temporary view of raw data that is patched
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW raw_patched AS
        SELECT 
            r.*,
            COALESCE(
                NULLIF(r."Code de la circonscription", ''), 
                ref."Code de la circonscription"
            ) as clean_circo_code,
            COALESCE(
                 NULLIF(r."Libellé de la circonscription", ''),
                 'Circo ' || ref."Code de la circonscription"
            ) as clean_circo_name
        FROM '{RAW_RESULTS}' r
        LEFT JOIN (
            SELECT DISTINCT id_brut_miom, "Code de la circonscription"
            FROM '{RAW_RESULTS}'
            WHERE id_election = '2022_legi_t1'
        ) ref ON r.id_brut_miom = ref.id_brut_miom
    """)
    
    con.execute("""
        INSERT OR IGNORE INTO fact_results
        SELECT 
            id_election,
            'circonscription' as level,
            LPAD("Code du département", 2, '0') || LPAD(clean_circo_code, 2, '0') as code_geo,
            ANY_VALUE(clean_circo_name) as name_geo,
            SUM(Inscrits), SUM(Votants), SUM(Abstentions), SUM(Blancs), SUM(Nuls), SUM(Exprimés),
            NULL, NULL, NULL
        FROM raw_patched
        WHERE clean_circo_code IS NOT NULL
        GROUP BY id_election, code_geo
    """)
    
    # 3. COMMUNES
    print("   > Processing Communes...")
    con.execute(f"""
        INSERT OR IGNORE INTO fact_results
        SELECT 
            id_election,
            'commune' as level,
            LPAD("Code du département", 2, '0') || LPAD("Code de la commune", 3, '0') as code_geo,
            ANY_VALUE("Libellé de la commune") as name_geo,
            SUM(Inscrits), SUM(Votants), SUM(Abstentions), SUM(Blancs), SUM(Nuls), SUM(Exprimés),
            NULL, NULL, NULL
        FROM '{RAW_RESULTS}'
        GROUP BY id_election, code_geo
    """)

    print("✅ Results Aggregated.")

def calculate_winners(con):
    print("⏳ Calculating Winners (Nuances) - This is the heavy lifting...")
    
    # We need to perform this update for each level where we have candidate data.
    # Candidates results are usually detailed at Commune (and Bureau) level.
    # For higher levels (Dept, Circo), we must aggregate candidate votes first.
    
    # 1. Prepare aggregated candidate votes per geo
    print("   > Creating temporary aggregated views...")
    
    # CIRCOS (Patched) - We need the patched view again or reuse it
    con.execute(f"""
        CREATE OR REPLACE TEMP VIEW cand_patched AS
        SELECT 
            c.*,
            COALESCE(
                 NULLIF(g."Code de la circonscription", ''), 
                 ref."Code de la circonscription"
            ) as clean_circo_code
        FROM '{RAW_CANDIDATES}' c
        LEFT JOIN '{RAW_RESULTS}' g ON c.id_election = g.id_election AND c.id_brut_miom = g.id_brut_miom
        LEFT JOIN (
            SELECT DISTINCT id_brut_miom, "Code de la circonscription"
            FROM '{RAW_RESULTS}'
            WHERE id_election = '2022_legi_t1'
        ) ref ON c.id_brut_miom = ref.id_brut_miom
    """)
    
    # Generic function to update winners for a level
    def update_level(level_name, geo_code_expr, source_table=None):
        if source_table is None:
            source_table = f"'{RAW_CANDIDATES}'"
            
        print(f"   > Computing winners for level: {level_name}...")
        
        # Determine Nuance column (fallback logic)
        nuance_col = "COALESCE(NULLIF(Nuance, ''), NULLIF(\"Libellé Abrégé Liste\", ''), NULLIF(Nom, ''), 'Autre')"
        
        update_query = f"""
            WITH ranked_winners AS (
                SELECT 
                    id_election,
                    {geo_code_expr} as code_geo,
                    {nuance_col} as win_nuance,
                    FIRST(Nom) as win_name,
                    SUM(Voix) as total_voix,
                    ROW_NUMBER() OVER(
                        PARTITION BY id_election, {geo_code_expr} 
                        ORDER BY SUM(Voix) DESC
                    ) as rn
                FROM {source_table}
                WHERE {geo_code_expr} IS NOT NULL
                GROUP BY id_election, code_geo, {nuance_col}
            )
            UPDATE fact_results
            SET 
                winner_nuance = rw.win_nuance,
                winner_name = rw.win_name,
                winner_score = rw.total_voix
            FROM ranked_winners rw
            WHERE fact_results.id_election = rw.id_election
              AND fact_results.level = '{level_name}'
              AND fact_results.code_geo = rw.code_geo
              AND rw.rn = 1
        """
        con.execute(update_query)

    # Apply to levels
    # Communes
    # update_level('commune', "LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0')")
    
    # Departements
    # update_level('departement', "LPAD(\"Code du département\", 2, '0')")
    
    # Circonscriptions (Using patched view)
    update_level('circonscription', "LPAD(\"Code du département\", 2, '0') || LPAD(clean_circo_code, 2, '0')", source_table="cand_patched")
    
    # Note: For communes and depts, we can use the raw table directly but need to handle join if we want perfect consistency?
    # Actually raw candidates table has Code Dept and Code Commune.
    update_level('departement', "LPAD(\"Code du département\", 2, '0')")
    update_level('commune', "LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0')")

    print("✅ Winners Calculated.")

def main():
    con = duckdb.connect(DB_PATH)
    try:
        init_db(con)
        load_elections_dim(con)
        process_results(con)
        calculate_winners(con)
        
        # Verify
        count = con.execute("SELECT COUNT(*) FROM fact_results").fetchone()[0]
        print(f"🎉 ETL Complete. Loaded {count} rows in fact_results.")
        
    finally:
        con.close()

if __name__ == "__main__":
    main()
