from fastapi import APIRouter, Depends, HTTPException, Query
from database import get_db_connection
import duckdb

router = APIRouter(prefix="/search", tags=["search"])

@router.get("/")
def search(
    q: str = Query(..., min_length=2),
    conn: duckdb.DuckDBPyConnection = Depends(get_db_connection)
):
    """
    Search for geographic zones (Commune, Departement).
    Returns a list of suggestions with their codes/levels.
    """
    # Normalize query for case insensitive
    q = q.lower()
    
    # We search in fact_results which has name_geo
    # We prioritize higher levels? Or just mix?
    # Let's search distinct names.
    
    # NOTE: Efficient search in DuckDB on large strings might need FTS index,
    # but for ~35k commmunes ILIKE is usually fine for a prototype.
    
    query = f"""
        SELECT level, code, label FROM (
            SELECT DISTINCT
                level,
                code_geo as code,
                name_geo as label
            FROM fact_results
            WHERE 
                level IN ('commune', 'departement') 
                AND lower(name_geo) LIKE '%' || ? || '%'
            
            UNION ALL
            
            -- Search Candidates (Linked to Circo)
            -- We find which Circo they ran in.
            -- Note: We need a link to candidates table. Assuming 'fact_votes_nuance' or raw table?
            -- We don't have a standardized 'dim_candidates' yet. 
            -- We will use the raw parquet or if we have a table.
            -- Using raw parquet for now as it contains names.
            SELECT DISTINCT
                'candidat' as level,
                LPAD("Code du département", 2, '0') || LPAD("Code de la circonscription", 2, '0') as code,
                Nom || ' ' || "Prénom" || ' (' || Nuance || ')' as label
            FROM '/data/Election/candidats_results.parquet'
            WHERE lower(Nom) LIKE '%' || ? || '%' OR lower("Prénom") LIKE '%' || ? || '%'
        )
        LIMIT 20
    """
    
    try:
        # Pass parameters 3 times (geo, cand_name, cand_surname)
        res = conn.execute(query, [q, q, q]).fetchall()
        
        results = []
        for r in res:
            results.append({
                "level": r[0],
                "code": r[1],
                "label": r[2]
            })
            
        # Sort results: shorter matches first? Departements first?
        # Python sort
        results.sort(key=lambda x: (x['level'] != 'departement', len(x['label'])))
        
        return {"results": results}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
