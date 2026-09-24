import duckdb

conn = duckdb.connect('/data/transparence.duckdb', read_only=True)

# Check table-bv-reu format
print("=== table-bv-reu.parquet ===")
print(conn.execute("""
    SELECT id_brut_reu, id_brut_miom, code_commune 
    FROM read_parquet('/data/Election/table-bv-reu.parquet') 
    LIMIT 5
""").df())

# Check bureaux GIS format
print("\n=== bureaux (GIS) ===")
print(conn.execute("""
    SELECT id_bv, codeBureauVote, codeCommune 
    FROM bureaux 
    LIMIT 5
""").df())

# Check overlap between id_brut_reu and id_bv
print("\n=== Match id_brut_reu == id_bv ===")
overlap = conn.execute("""
    SELECT COUNT(*) as nb_match
    FROM read_parquet('/data/Election/table-bv-reu.parquet') t
    JOIN bureaux b ON t.id_brut_reu = b.id_bv
""").fetchone()[0]
print(f"Matches: {overlap}")

# Check overlap between id_brut_reu and codeBureauVote
print("\n=== Match id_brut_reu == codeBureauVote ===")
overlap2 = conn.execute("""
    SELECT COUNT(*) as nb_match
    FROM read_parquet('/data/Election/table-bv-reu.parquet') t
    JOIN bureaux b ON t.id_brut_reu = b.codeBureauVote
""").fetchone()[0]
print(f"Matches: {overlap2}")
