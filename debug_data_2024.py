
import duckdb
import pandas as pd

def check_2024_data():
    conn = duckdb.connect()
    
    # 1. Check a known missing circo (e.g. 5706 Moselle 6, or 7518 Paris 18) in Candidats 2024
    print("\n--- Inspecting Candidates 2024 (Dept 57/75) ---")
    query = """
        SELECT id_election, "Code du département", id_brut_miom 
        FROM 'data/Election/candidats_results.parquet'
        WHERE id_election = '2024_legi_t2' 
        AND "Code du département" IN ('57', '75')
        LIMIT 10
    """
    df = conn.execute(query).fetchdf()
    print(df)
    
    # 2. Check General Results 2024 for all columns
    print("\n--- Inspecting General Results 2024 (Dept 57/75) - All Columns ---")
    query = """
        SELECT *
        FROM 'data/Election/general_results.parquet'
        WHERE id_election = '2024_legi_t2'
        AND "Code du département" IN ('57', '75')
        LIMIT 1
    """
    try:
        df = conn.execute(query).fetchdf()
        print(df.columns.tolist())
        print(df.iloc[0])
    except Exception as e:
        print(f"Error querying general results: {e}")

    print("\n--- Check 75056_1840 in 2022 ---")
    query = """
        SELECT id_brut_miom, "Code de la circonscription"
        FROM 'data/Election/general_results.parquet'
        WHERE id_election = '2022_legi_t1'
        AND id_brut_miom = '75056_1840'
    """
    print(conn.execute(query).fetchdf())
    
    print("\n--- Check ANY bureau for Circo 18 in 2022 ---")
    query = """
        SELECT id_brut_miom
        FROM 'data/Election/general_results.parquet'
        WHERE id_election = '2022_legi_t1'
        AND "Code du département" = '75'
        AND "Code de la circonscription" = '18'
        LIMIT 10
    """
    print(conn.execute(query).fetchdf())

if __name__ == "__main__":
    check_2024_data()
