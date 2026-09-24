-- Transparence Publique V2 Schema

-- 1. Dimension: Elections Metadata
CREATE TABLE IF NOT EXISTS dim_elections (
    id_election VARCHAR PRIMARY KEY,
    label VARCHAR,
    year INTEGER,
    type VARCHAR, -- pres, legi, euro...
    round VARCHAR, -- t1, t2
    date_election DATE
);

-- 2. Fact: Aggregated Results (Pre-calculated for map coloring)
-- Granularity: Bureau (finest), but also stored at aggregated levels for speed? 
-- Actually DuckDB is fast enough to agg on the fly if the schema is clean.
-- We will store at BUREAU level, but clean.
CREATE TABLE IF NOT EXISTS fact_results (
    id_election VARCHAR,
    level VARCHAR, -- bureau, commune, circonscription, departement, national
    code_geo VARCHAR, -- Standardized code (e.g. 01001 for commune, 0101 for circo)
    name_geo VARCHAR,
    
    -- Metrics
    inscrits INTEGER,
    votants INTEGER,
    abstentions INTEGER,
    blancs INTEGER,
    nuls INTEGER,
    exprimes INTEGER,
    
    -- Winner Info (Pre-calculated for coloring)
    winner_nuance VARCHAR,
    winner_name VARCHAR,
    winner_score INTEGER,
    
    PRIMARY KEY (id_election, level, code_geo)
);

-- 3. Fact: Nuance Details (For Charts & Analysis)
CREATE TABLE IF NOT EXISTS fact_votes_nuance (
    id_election VARCHAR,
    level VARCHAR,
    code_geo VARCHAR,
    nuance VARCHAR, -- Standardized nuance code
    voix INTEGER,
    
    FOREIGN KEY (id_election) REFERENCES dim_elections(id_election)
);
