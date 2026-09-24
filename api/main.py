from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from endpoints import elections, geo
from database import get_db_connection, create_connection
import duckdb

app = FastAPI(title="Transparence Publique API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from endpoints import elections
from endpoints import search
app.include_router(elections.router)
app.include_router(search.router)
app.include_router(geo.router)
from endpoints import tiles
app.include_router(tiles.router)

@app.get("/")
def read_root():
    return {"message": "Transparence Publique API is running"}

@app.get("/health")
def health_check():
    from database import create_connection
    conn = create_connection()
    try:
        conn.execute("SELECT 1")
        return {"status": "ok"}
    finally:
        conn.close()

@app.on_event("startup")
async def on_startup():
    # Initialize DB (create tables if not exist)
    # Since we use persistent DB file mapping in docker, this persists.
    
    # Check for Seeding strategy (Docker)
    import os
    import shutil
    from database import DB_PATH
    
    seed_path = os.getenv("SEED_DB_PATH")
    if seed_path and os.path.exists(seed_path) and not os.path.exists(DB_PATH):
        print(f"Build DB from seed: Copying {seed_path} to {DB_PATH}...")
        try:
             # Ensure directory exists
            os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
            shutil.copy2(seed_path, DB_PATH)
            print("✅ Database seeded successfully.")
        except Exception as e:
            print(f"❌ Failed to seed database: {e}")

    # Connect with write access for initialization
    try:
        conn = create_connection(read_only=False)
        # Spatial already loaded by create_connection
        geo.init_geo_data(conn)
        conn.close()
    except Exception as e:
        print(f"⚠️ Startup initialization warning: {e}")
        # If we fail to connect writable (lock?), try to continue, maybe it's already init
        pass
