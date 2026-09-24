from fastapi import APIRouter, Depends, HTTPException, Query
from database import get_db_connection
import duckdb

router = APIRouter(prefix="/elections", tags=["elections"])

PRETTY_ELECTION_NAMES = {
    "legi": "Législatives",
    "pres": "Présidentielle",
    "euro": "Européennes",
    "regi": "Régionales",
    "muni": "Municipales",
    "cant": "Cantonales",
    "dpmt": "Départementales"
}

@router.get("/")
def list_elections(conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)):
    """
    List all available elections with metadata and pretty names.
    """
    try:
        # Aggregate to find available levels
        # We check if at least one record has a value for the specific code
        query = """
            SELECT 
                id_election, 
                COUNT(NULLIF("Code du b.vote", '')) as nb_bureaux,
                COUNT(NULLIF("Code de la commune", '')) as nb_communes,
                COUNT(NULLIF("Code de la circonscription", '')) as nb_circos,
                COUNT(NULLIF("Code du département", '')) as nb_depts
            FROM '/data/Election/general_results.parquet' 
            GROUP BY id_election
            ORDER BY id_election DESC
        """
        elections = conn.execute(query).fetchall()
        
        results = []
        for e in elections:
            eid = e[0]
            nb_bureaux = e[1]
            nb_communes = e[2]
            nb_circos = e[3]
            nb_depts = e[4]
            
            # Determine available levels
            levels = []
            if nb_depts > 0: levels.append("departements")
            if nb_circos > 0 or "2024_legi" in eid: levels.append("circonscriptions")
            if nb_communes > 0: levels.append("communes")
            if nb_bureaux > 0: levels.append("bureaux")

            parts = eid.split('_')
            if len(parts) >= 3:
                year = parts[0]
                etype = parts[1]
                eround = parts[2].upper()
                
                pretty_type = PRETTY_ELECTION_NAMES.get(etype, etype.title())
                label = f"{year} {pretty_type} - {eround}"
                
                results.append({
                    "id": eid,
                    "label": label,
                    "year": year,
                    "type": etype,
                    "round": eround,
                    "available_levels": levels
                })
        
        return {"elections": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/groups")
def list_election_groups(conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)):
    """
    List elections grouped by year and type (combining t1/t2).
    """
    try:
        query = "SELECT DISTINCT id_election FROM '/data/Election/general_results.parquet'"
        elections = conn.execute(query).fetchall()
        raw_ids = [e[0] for e in elections]
        
        # Group logic
        groups = {}
        for eid in raw_ids:
            # format: YYYY_type_tX
            parts = eid.split('_')
            if len(parts) >= 3:
                key = "_".join(parts[:-1]) # YYYY_type
                round_code = parts[-1] # t1 or t2
                if key not in groups:
                    groups[key] = []
                groups[key].append(round_code)
        
        result = []
        for k, rounds in groups.items():
            result.append({
                "group_id": k,
                "rounds": sorted(rounds),
                "label": k.replace("_", " ").title()
            })
        
        return {"groups": sorted(result, key=lambda x: x['group_id'], reverse=True)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/compare")
def compare_rounds(
    group_id: str,
    level: str = "national",
    code_departement: str = None,
    code_commune: str = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Compare T1 vs T2 for a given election group at various levels.
    """
    table = "'/data/Election/general_results.parquet'"
    
    where_clauses = [f"id_election LIKE '{group_id}%'"]
    if code_departement:
        where_clauses.append(f"\"Code du département\" = '{code_departement}'")
    
    if code_commune:
        where_clauses.append(f"LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0') = '{code_commune}'")

    where_str = " AND ".join(where_clauses)

    query = f"""
        SELECT id_election, 
        SUM(Inscrits) as Inscrits, 
        SUM(Abstentions) as Abstentions,
        SUM(Votants) as Votants,
        SUM(Blancs) as Blancs,
        SUM(Nuls) as Nuls,
        SUM(Exprimés) as Exprimés
        FROM {table}
        WHERE {where_str}
        GROUP BY id_election
        ORDER BY id_election
    """
    
    try:
        res = conn.execute(query).fetchdf()
        return res.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history")
def get_election_history(
    type: str,
    level: str = "national",
    code_departement: str = None,
    code_commune: str = None,
    round: str = "t2",
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    # For Européennes, there is only one round (T1)
    effective_round = round.lower()
    if type.lower() == "euro" and round.lower() == "t2":
        effective_round = "t1"
    
    table = "'/data/Election/general_results.parquet'"

    # Filter by type and round: e.g. %_pres_t2
    where_clauses = [f"id_election LIKE '%_{type}_{effective_round}'"]
    
    if code_departement:
        where_clauses.append(f"\"Code du département\" = '{code_departement}'")
    
    if code_commune:
        where_clauses.append(f"LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0') = '{code_commune}'")

    where_str = " AND ".join(where_clauses)

    query = f"""
        SELECT 
            id_election,
            -- Extract year for grouping
            SUBSTRING(id_election, 1, 4) as year,
            SUM(Inscrits) as Inscrits, 
            SUM(Abstentions) as Abstentions,
            SUM(Votants) as Votants
        FROM {table}
        WHERE {where_str}
        GROUP BY id_election, year
        ORDER BY year ASC
    """
    
    try:
        res = conn.execute(query).fetchdf()
        return res.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{election_id}/results")
def get_election_results(
    election_id: str,
    level: str = Query("national", enum=["national", "region", "departement", "circonscription", "commune", "bureau"]),
    code_region: str = None,
    code_departement: str = None,
    code_circonscription: str = None,
    code_commune: str = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Get aggregated results for a specific election.
    """
    table = "'/data/Election/general_results.parquet'"
    
    # Base cols to select/sum
    metrics = [
        "Inscrits", "Abstentions", "Votants", "Blancs", "Nuls", "Exprimés"
    ]
    
    # Dynamic query construction
    select_clauses = []
    group_by_clauses = []
    where_clauses = [f"id_election = '{election_id}'"]
    
    if level == "national":
        select_clauses = ["'France' as name", "'FR' as code"]
    
    elif level == "region":
        # We don't have explicit region code in current parquet schema view, 
        # grouping by Dept for now as placeholder or need join.
        # Actually, "Libellé du département" is available.
        # Let's fallback to Departement if region requested until mapping exists.
        select_clauses = ["\"Code du département\" as code", "\"Libellé du département\" as name"]
        group_by_clauses = ["\"Code du département\"", "\"Libellé du département\""]

    elif level == "departement":
        select_clauses = ["LPAD(\"Code du département\", 2, '0') as code", "\"Libellé du département\" as name"]
        group_by_clauses = ["\"Code du département\"", "\"Libellé du département\""]
    
    elif level == "circonscription":
        select_clauses = [
            "LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la circonscription\", 2, '0') as code", 
            "\"Libellé de la circonscription\" as name"
        ]
        group_by_clauses = ["\"Code du département\"", "\"Code de la circonscription\"", "\"Libellé de la circonscription\""]
        if code_departement:
            where_clauses.append(f"\"Code du département\" = '{code_departement}'")
            if code_circonscription:
                 # Ensure we match the full code if provided as dept+circo, otherwise just the circo part if separated
                 # Here assuming code_circonscription is standard "0101" format (dept+circo) used in frontend
                 # But the Parquet has separate columns.
                 # If input is 4 chars, we can split it or just filter using constructing like in select.
                 where_clauses.append(f"LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la circonscription\", 2, '0') = '{code_circonscription}'")

        # PATCH 2024 LEGI: Missing "Code de la circonscription" in general_results
        # Strategy: Join with 2022_legi_t1 (which has it) on id_brut_miom
        if "2024_legi" in election_id:
             # Override the table source to include the join
             table = f"""
                '/data/Election/general_results.parquet' r 
                LEFT JOIN (
                    SELECT DISTINCT id_brut_miom, "Code de la circonscription" as circo_22 
                    FROM '/data/Election/general_results.parquet' 
                    WHERE id_election = '2022_legi_t1' AND "Code de la circonscription" IS NOT NULL
                ) ref ON r.id_brut_miom = ref.id_brut_miom
             """
             # Update select clause to use the alias from 2022
             select_clauses = [
                "LPAD(r.\"Code du département\", 2, '0') || LPAD(ref.circo_22, 2, '0') as code", 
                "COALESCE(r.\"Libellé de la circonscription\", 'Circo ' || ref.circo_22) as name"
             ]
             # Update group by
             group_by_clauses = ["r.\"Code du département\"", "ref.circo_22", "r.\"Libellé de la circonscription\""]
             
             # Re-apply where clause patches for alias 'r'
             # Note: where_clauses[0] is id_election. id_election is likely unique anyway so ambiguousness is low basically,
             # but strictly we should alias. However, duckdb is smart.
             # But the Dept/Circo filters added above need to be aliased or patched?
             # Dept is in 'r', Circo is in 'ref'
             
             # We need to rebuild where clauses for this specific case to be safe with aliases
             new_where = [f"r.id_election = '{election_id}'"]
             if code_departement:
                 new_where.append(f"r.\"Code du département\" = '{code_departement}'")
             if code_circonscription:
                 # Filter on the Joined Column
                 new_where.append(f"LPAD(r.\"Code du département\", 2, '0') || LPAD(ref.circo_22, 2, '0') = '{code_circonscription}'")
             
             where_clauses = new_where
    
    elif level == "commune":
        select_clauses = [
            "LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0') as code", 
            "\"Libellé de la commune\" as name"
        ]
        group_by_clauses = ["\"Code du département\"", "\"Code de la commune\"", "\"Libellé de la commune\""]
        if code_departement:
            where_clauses.append(f"\"Code du département\" = '{code_departement}'")
        if code_commune:
            where_clauses.append(f"LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0') = '{code_commune}'")

    elif level == "bureau":
        # Join with REU table to get official id_brut_reu (matches GIS id_bv)
        # We override the table source for this specific level
        table = "'/data/Election/general_results.parquet' r JOIN '/data/Election/table-bv-reu.parquet' t ON r.id_brut_miom = t.id_brut_miom"
        
        select_clauses = [
            "t.id_brut_reu as code",
            "t.libelle_reu as name"
        ]
        # We must group by the selected non-aggregated columns
        group_by_clauses = ["t.id_brut_reu", "t.libelle_reu"]
        
        if code_departement:
            # explicit alias for safety
            where_clauses.append(f"r.\"Code du département\" = '{code_departement}'")
        if code_commune:
             # t.code_commune in REU is likely the 5-digit INSEE code (e.g. 01001)
             if len(code_commune) == 5:
                 where_clauses.append(f"t.code_commune = '{code_commune}'")
             else:
                 where_clauses.append(f"r.\"Code de la commune\" = '{code_commune}'")

    # Sum metrics
    for m in metrics:
        select_clauses.append(f"SUM(\"{m}\") as {m}")

    # Build Query
    select_str = ", ".join(select_clauses)
    where_str = " AND ".join(where_clauses)
    group_by_str = ", ".join(group_by_clauses)
    
    if not select_clauses: 
        raise HTTPException(status_code=400, detail=f"Level {level} not fully supported yet")

    full_query = f"""
        SELECT {select_str}
        FROM {table}
        WHERE {where_str}
        {('GROUP BY ' + group_by_str) if group_by_clauses else ''}
    """
    
    print(f"Executing: {full_query}")
    try:
        results = conn.execute(full_query).fetchdf() # Return as pandas DF for easy json conversion
        results = results.fillna(0) # Replace NaN with 0 for JSON serialization
        return results.to_dict(orient="records")
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/nuance")
def get_nuance_history(
    type: str,
    level: str = "national",
    code_departement: str = None,
    code_circonscription: str = None,
    code_commune: str = None,
    limit: int = 5,
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Get evolution of top nuances over years for a specific election type.
    """
    table = "'/data/Election/candidats_results.parquet'"
    
    # Filter by type and round: default to round 1 for history usually? 
    # Or should we respect T2? History is usually broad political trends -> T1 is better.
    # But user might be on T2 tab. Let's stick to T1 for consistent political landscape.
    # Exception: Euro only has T1 (grouped as T1 in DB?).
    
    # We select T1 by default for history to be comparable
    round_filter = "t1"
    if type == "euro": round_filter = "t1" # Euro is single round
    
    where_clauses = [f"id_election LIKE '%_{type}_{round_filter}'"]
    
    if level == "departement" and code_departement:
        where_clauses.append(f"\"Code du département\" = '{code_departement}'")
    elif level == "circonscription" and code_circonscription:
         # Need Join if circo code is missing in candidates, same as other endpoint
         table = "'/data/Election/candidats_results.parquet' c JOIN '/data/Election/general_results.parquet' g ON c.id_election = g.id_election AND c.id_brut_miom = g.id_brut_miom"
         where_clauses = [f"id_election LIKE '%_{type}_{round_filter}'"] # Reset base clause with alias if needed?
         # Acutally just use full alias in field
         where_clauses = [f"c.id_election LIKE '%_{type}_{round_filter}'"]
         where_clauses.append(f"LPAD(c.\"Code du département\", 2, '0') || LPAD(g.\"Code de la circonscription\", 2, '0') = '{code_circonscription}'")
    elif level == "commune" and code_commune:
         where_clauses.append(f"LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0') = '{code_commune}'")

    where_str = " AND ".join(where_clauses)
    
    # Selecting Nuance with fallback
    # Note: For presidential, "Nom" is often the meaningful key.
    # If type is 'pres', maybe prioritize Nom if Nuance is empty?
    # Generalized fallback: Nuance -> Libellé -> Nom -> Autre
    nuance_expr = "COALESCE(NULLIF(Nuance, ''), NULLIF(\"Libellé Abrégé Liste\", ''), NULLIF(Nom, ''), 'Autre')"
    
    # We only have the 'c' alias if we joined tables i.e. (level == "circonscription" AND code_circonscription IS NOT NULL)
    if level == "circonscription" and code_circonscription:
        nuance_expr = "COALESCE(NULLIF(c.Nuance, ''), NULLIF(c.\"Libellé Abrégé Liste\", ''), NULLIF(c.Nom, ''), 'Autre')"

    query = f"""
        WITH yearly_total AS (
            SELECT 
                SUBSTRING(id_election, 1, 4) as year,
                SUM(Voix) as total_votes
            FROM {table}
            WHERE {where_str}
            GROUP BY 1
        ),
        nuance_votes AS (
            SELECT 
                SUBSTRING(id_election, 1, 4) as year,
                {nuance_expr} as label,
                SUM(Voix) as voix
            FROM {table}
            WHERE {where_str}
            GROUP BY 1, 2
        )
        SELECT 
            n.year,
            n.label,
            n.voix,
            (n.voix::DOUBLE / t.total_votes) * 100 as percentage
        FROM nuance_votes n
        JOIN yearly_total t ON n.year = t.year
        -- Filter top N per year? Or just return all and let frontend filter?
        -- Returning all is safer for small datasets like elections history
        ORDER BY n.year, n.voix DESC
    """
    
    try:
        res = conn.execute(query).fetchdf()
        
        # Reformating for Frontend: Series by Nuance
        # We need a list of years, and for each nuance, a data array matching those years
        records = res.to_dict(orient="records")
        
        # Pivot manually
        years = sorted(list(set(r['year'] for r in records)))
        nuance_map = {}
        
        for r in records:
            lbl = r['label']
            if lbl not in nuance_map:
                nuance_map[lbl] = {y: 0 for y in years}
            nuance_map[lbl][r['year']] = r['percentage']
            
        series = []
        for lbl, data in nuance_map.items():
            # Filter out insignificant nuances? (e.g. never reached 5%)
            # Calculate max metric
            max_val = max(data.values())
            if max_val > 3.0: # Threshold: 3% at least once
                series.append({
                    "name": lbl,
                    "data": [data[y] for y in years]
                })
        
        # Sort series by average popularity or something?
        # Sort by most recent value?
        return {
            "years": years,
            "series": series
        }
            
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{election_id}/winners")
def get_election_winners(
    election_id: str,
    level: str = Query("departement", enum=["departement", "circonscription", "commune", "bureau"]),
    code_departement: str = None,
    code_circonscription: str = None,
    code_commune: str = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Identifies the winning nuance/candidate for each area at a specific level.
    """
    table = "'/data/Election/candidats_results.parquet'"
    
    # Define area key based on level
    if level == "departement":
        area_key = "LPAD(\"Code du département\", 2, '0')"
    elif level == "circonscription":
        area_key = "LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la circonscription\", 2, '0')"
    elif level == "commune":
        area_key = "LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0')"
    else: # bureau
        table = "'/data/Election/candidats_results.parquet' c JOIN '/data/Election/table-bv-reu.parquet' t ON c.id_brut_miom = t.id_brut_miom"
        area_key = "t.id_brut_reu"

    where_clauses = [f"id_election = '{election_id}'"]
    
    # Handle circonscription level which requires a join for the code
    if level == "circonscription":
        table = "'/data/Election/candidats_results.parquet' c JOIN '/data/Election/general_results.parquet' g ON c.id_election = g.id_election AND c.id_brut_miom = g.id_brut_miom"
        area_key = "g.\"Code de la circonscription\"" # Use alias g
        # Disambiguate where clauses
        where_clauses = [f"c.id_election = '{election_id}'"]

        # PATCH 2024 LEGI: Missing circo code in general AND candidats
        # Strategy: Join g (general) with ref (2022) as above
        if "2024_legi" in election_id:
             # Strategy: 
             # 1. Try exact join on Bureau ID (id_brut_miom) with 2022
             # 2. If missing, fallback to Commune's Majority Circo from 2022
             table = f"""
                '/data/Election/candidats_results.parquet' c 
                JOIN '/data/Election/general_results.parquet' g ON c.id_election = g.id_election AND c.id_brut_miom = g.id_brut_miom
                LEFT JOIN (
                    SELECT DISTINCT id_brut_miom, "Code de la circonscription" as circo_22 
                    FROM '/data/Election/general_results.parquet' 
                    WHERE id_election = '2022_legi_t1'
                ) ref ON c.id_brut_miom = ref.id_brut_miom
                LEFT JOIN (
                    SELECT "Code du département" as dep, "Code de la commune" as com, 
                           mode("Code de la circonscription") as circo_mode
                    FROM '/data/Election/general_results.parquet'
                    WHERE id_election = '2022_legi_t1'
                    GROUP BY dep, com
                ) ref_com ON g."Code du département" = ref_com.dep AND g."Code de la commune" = ref_com.com
             """
             # Coalesce: Use Bureau mapping first, then Commune fallback
             area_key = "LPAD(g.\"Code du département\", 2, '0') || LPAD(COALESCE(ref.circo_22, ref_com.circo_mode), 2, '0')"

    
    if code_departement and level != "departement":
        # Check if we are in joined mode
        prefix = "c." if level == "circonscription" else ""
        where_clauses.append(f"{prefix}\"Code du département\" = '{code_departement}'")
    
    if code_circonscription and (level == "commune" or level == "bureau"):
        # This case is tricky if we are seeking comm/bureau but filtering by circo?
        # Standard candidates table doesn't have circo. 
        # If we need to filter by circo for commune/bureau level, we also need join.
        # But 'winners' for commune/bureau usually doesn't filter by circo in typical frontend flow (drill down is dept -> circo -> commune).
        # IF it does, we need join. Let's assume for now filters logic matches level.
        # Original code used: "Code de la circonscription". This would fail if column missing.
        # Let's simple skip this valid check if column missing, or force join?
        # User error was specifically for level=circonscription.
        where_clauses.append(f"\"Code de la circonscription\" = '{code_circonscription}'") # This might fail if no join
        
    if code_commune and level == "bureau":
        where_clauses.append(f"LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0') = '{code_commune}'")

    where_str = " AND ".join(where_clauses)

    query = f"""
        WITH ranked AS (
            SELECT 
                {area_key} as code,
                Nuance,
                Nom,
                "Prénom",
                Voix,
                ROW_NUMBER() OVER(PARTITION BY {area_key} ORDER BY Voix DESC) as r
            FROM {table}
            WHERE {where_str}
        )
        SELECT code, Nuance, Nom, "Prénom", Voix FROM ranked WHERE r = 1
    """
    
    try:
        res = conn.execute(query).fetchdf()
        res = res.fillna(0)
        return res.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{election_id}/candidates")
def get_candidate_distribution(
    election_id: str,
    level: str = "national",
    code_departement: str = None,
    code_circonscription: str = None,
    code_commune: str = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Get voice distribution by nuance for localized charts.
    """
    table = "'/data/Election/candidats_results.parquet'"
    where_clauses = [f"id_election = '{election_id}'"]
    
    if level == "circonscription":
        # Join needed for Code de la circonscription
        table = "'/data/Election/candidats_results.parquet' c JOIN '/data/Election/general_results.parquet' g ON c.id_election = g.id_election AND c.id_brut_miom = g.id_brut_miom"
        where_clauses = [f"c.id_election = '{election_id}'"]
        
        if code_departement:
            where_clauses.append(f"c.\"Code du département\" = '{code_departement}'")
        if code_circonscription:
             where_clauses.append(f"LPAD(c.\"Code du département\", 2, '0') || LPAD(g.\"Code de la circonscription\", 2, '0') = '{code_circonscription}'")

        # PATCH 2024 LEGI
        if "2024_legi" in election_id:
             # Similar join structure
              table = f"""
                '/data/Election/candidats_results.parquet' c 
                JOIN '/data/Election/general_results.parquet' g ON c.id_election = g.id_election AND c.id_brut_miom = g.id_brut_miom
                LEFT JOIN (
                    SELECT DISTINCT id_brut_miom, "Code de la circonscription" as circo_22 
                    FROM '/data/Election/general_results.parquet' 
                    WHERE id_election = '2022_legi_t1'
                ) ref ON c.id_brut_miom = ref.id_brut_miom
             """
              if code_circonscription:
                  # Clear previous where clause to avoid ambiguity/error on column
                  # Rebuild where clauses
                  where_clauses = [f"c.id_election = '{election_id}'"]
                  if code_departement: where_clauses.append(f"c.\"Code du département\" = '{code_departement}'")
                  where_clauses.append(f"LPAD(c.\"Code du département\", 2, '0') || LPAD(ref.circo_22, 2, '0') = '{code_circonscription}'")
             
    else:
        # Standard levels (National, Dept, Commune - Commune codes are in candidates table)
        if level == "departement" and code_departement:
            where_clauses.append(f"\"Code du département\" = '{code_departement}'")
        elif level in ["commune", "bureau"] and code_commune:
             where_clauses.append(f"LPAD(\"Code du département\", 2, '0') || LPAD(\"Code de la commune\", 3, '0') = '{code_commune}'")

    where_str = " AND ".join(where_clauses)
    
    query = f"""
        SELECT 
            COALESCE(NULLIF(Nuance, ''), NULLIF("Libellé Abrégé Liste", ''), 'Autre') as Nuance,
            SUM(Voix) as voix,
            -- Attempt to retrieve candidate info if available (valid for local granularities where 1 candidate per nuance)
            MAX(Nom) as nom,
            MAX("Prénom") as prenom
        FROM {table}
        WHERE {where_str}
        GROUP BY 1
        ORDER BY voix DESC
    """
    
    try:
        res = conn.execute(query).fetchdf()
        res = res.fillna(0)
        return res.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
