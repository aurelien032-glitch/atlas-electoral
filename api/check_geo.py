import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Checking Geo Tables:")
    tables = ["departements", "circonscriptions", "communes", "bureaux"]
    for t in tables:
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            print(f"{t}: {count} rows")
        except Exception as e:
            print(f"{t}: Error - {e}")
            
    print("\nSample Circonscription:")
    print(conn.execute("SELECT * EXCLUDE(geom) FROM circonscriptions LIMIT 1").df())
    
    conn.close()
except Exception as e:
    print(f"Connection error: {e}")
