import duckdb
from database import create_connection

try:
    conn = create_connection()
    print("Checking Circonscriptions...")
    try:
        conn.execute("SELECT COUNT(*) FROM circonscriptions")
        print("Circonscriptions table exists.")
    except:
        print("Circonscriptions table missing. Creating...")
        conn.execute("""
            CREATE TABLE circonscriptions AS 
            SELECT codeCirconscription, nomCirconscription, codeDepartement, ST_Union_Agg(geom) as geom 
            FROM bureaux 
            GROUP BY codeCirconscription, nomCirconscription, codeDepartement
        """)
        print("Circonscriptions created successfully.")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
