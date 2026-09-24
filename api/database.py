import duckdb

import os

# Default to local file, but allow override (e.g. for Docker persistence)
DB_PATH = os.getenv("DUCKDB_PATH", "consolidated.duckdb")

def create_connection(read_only=True):
    """
    Creates and returns a raw DuckDB connection.
    Useful for scripts or startup events where dependency injection isn't available.
    """
    # Enable spatial extension by default on new connections
    # Note: initialization might require read_only=False
    conn = duckdb.connect(DB_PATH, read_only=read_only)
    conn.execute("INSTALL spatial; LOAD spatial;")
    return conn

def get_db_connection():
    """
    FastAPI Dependency that yields a DuckDB connection.
    Ensures connection is closed after request.
    """
    conn = create_connection()
    try:
        yield conn
    finally:
        conn.close()
