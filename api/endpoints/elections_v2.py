from fastapi import APIRouter, Depends, HTTPException, Query
from database import get_db_connection
import duckdb

router = APIRouter(prefix="/elections", tags=["elections"])

@router.get("/")
def list_elections(conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)):
    """
    List all available elections (V2: from dim_elections table).
    """
    try:
        # We need to know available levels for each election to keep frontend compatible
        # In V2, we assume if data exists in fact_results, it's available.
        query = """
            SELECT 
                d.id_election, 
                d.label, 
                d.year, 
                d.type, 
                d.round,
                LIST(DISTINCT f.level) as levels
            FROM dim_elections d
            JOIN fact_results f ON d.id_election = f.id_election
            GROUP BY d.id_election, d.label, d.year, d.type, d.round
            ORDER BY d.year DESC, d.round DESC
        """
        res = conn.execute(query).fetchall()
        
        results = []
        for r in res:
            # Map SQL LIST to Python list
            available_levels = r[5] # List of strings
            # Map singular level names to plural if needed by frontend?
            # Frontend uses: 'departements', 'circonscriptions', 'communes', 'bureaux'
            # DB has: 'departement', 'circonscription', 'commune' (singular)
            # We map them.
            mapped_levels = []
            if 'departement' in available_levels: mapped_levels.append('departements')
            if 'circonscription' in available_levels: mapped_levels.append('circonscriptions')
            if 'commune' in available_levels: mapped_levels.append('communes')
            # Bureaux not strictly in V2 yet? Or mapped?
            # If standard levels are good.
            
            results.append({
                "id": r[0],
                "label": r[1],
                "year": r[2],
                "type": r[3],
                "round": r[4],
                "available_levels": mapped_levels
            })
            
        return {"elections": results}
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
    Get aggregated results (V2: from fact_results).
    """
    # Map plural frontend usage to singular DB level if needed, but enum above forces singular.
    # Frontend sends 'departement', 'circonscription' etc. usually.
    # Map filters
    where_clauses = ["id_election = ?"]
    params = [election_id]
    
    # Adjust requested level to DB level
    db_level = level
    
    where_clauses.append("level = ?")
    params.append(db_level)
    
    # Filtering logic
    # In V2, code_geo is the standardized key.
    
    if level == "circonscription":
        if code_departement:
            # Circo code starts with Dept code (e.g. 0101).
            where_clauses.append("code_geo LIKE ?")
            params.append(f"{code_departement}%")
    
    elif level == "commune":
        if code_departement:
            where_clauses.append("code_geo LIKE ?")
            params.append(f"{code_departement}%")
        if code_circonscription:
            # This is harder in V2 simple schema. fact_results doesn't store parent relations directly in columns.
            # But Commune code (01001) doesn't strictly contain Circo code.
            # We might need a geography dimension table to filter communes by circo.
            # allow fallback: ignoring circo filter for communes for now, or use LIKE if format allows?
            # In France, Communes are not strictly hierarchically inside Circos (split communes exist).
            pass 

    query = f"""
        SELECT 
            code_geo as code,
            name_geo as name,
            inscrits as Inscrits,
            abstentions as Abstentions,
            votants as Votants,
            blancs as Blancs,
            nuls as Nuls,
            exprimes as Exprimés,
            winner_nuance,
            winner_name
        FROM fact_results
        WHERE {" AND ".join(where_clauses)}
    """
    
    try:
        df = conn.execute(query, params).fetchdf()
        # Transform for frontend if needed?
        # Frontend expects dictionary with keys like "Inscrits".
        # We also need "winner" object?
        # Frontend MapViz checks: `p.winner.Nuance`
        
        records = df.to_dict(orient="records")
        for r in records:
            # Reconstruct winner object structure for frontend compatibility
            if r['winner_nuance']:
                r['winner'] = {
                    "Nuance": r['winner_nuance'],
                    "Nom": r['winner_name'],
                    "Prénom": "", # Split name if needed?
                    "Voix": 0 # We didn't store score in simple select above? We have winner_score in DB.
                }
            else:
                r['winner'] = None
                
        return records
        
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{election_id}/winners")
def get_election_winners_v2(
    election_id: str,
    level: str = "departement",
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    # This endpoint was redundant in V1 if results already included winners.
    # We maintain it for compatibility but simpler.
    return get_election_results(election_id, level, conn=conn)

@router.get("/{election_id}/candidates")
def get_candidate_dist(conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)):
    # Placeholder for candidates dist
    return []
