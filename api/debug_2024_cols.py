import duckdb
from database import create_connection

try:
    conn = create_connection()
    # Check column names and sample data for 2024_legi_t2
    query = """
        SELECT *
        FROM '/data/Election/general_results.parquet'
        WHERE id_election = '2024_legi_t2'
        LIMIT 1
    """
    res = conn.execute(query).df()
    print("Columns and sample for 2024_legi_t2:")
    print(res.columns.tolist())
    print(res.iloc[0])
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
