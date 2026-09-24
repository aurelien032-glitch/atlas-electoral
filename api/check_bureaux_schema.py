import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("=== Bureaux Schema ===")
    print(conn.execute("DESCRIBE bureaux").df())
    
    print("\n=== Bureaux Sample (1 row) ===")
    # Print all cols for the first row to see property names
    res = conn.execute("SELECT * FROM bureaux LIMIT 1").df()
    print(res.iloc[0])
    
    conn.close()
except Exception as e:
    print(f"Error: {e}")
