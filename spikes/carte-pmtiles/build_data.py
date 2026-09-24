"""Prototype de carte : préparation des données d'un scrutin.

Lit les Parquet officiels de data.gouv.fr à distance (DuckDB httpfs, requêtes Range) :
aucune copie brute n'est téléchargée. Écrit dans data/ :
  <scrutin>_participation.parquet  code_bv, inscrits, votants, exprimes
  <scrutin>_voix.parquet           code_bv, cand, voix (format long, trié)
  <scrutin>_candidats.json         candidats triés par voix nationales (index = cand)

Prévu pour un scrutin à candidats nationaux (présidentielle, européennes).

Usage : python build_data.py [id_scrutin]      (défaut : 2022_pres_t1)
"""
import json
import pathlib
import sys
import time

import duckdb

SCRUTIN = sys.argv[1] if len(sys.argv) > 1 else "2022_pres_t1"
SOURCE = "https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/elections/"
SORTIE = pathlib.Path(__file__).parent / "data"
SORTIE.mkdir(exist_ok=True)
F_PARTICIPATION = (SORTIE / f"{SCRUTIN}_participation.parquet").as_posix()
F_VOIX = (SORTIE / f"{SCRUTIN}_voix.parquet").as_posix()
F_CANDIDATS = SORTIE / f"{SCRUTIN}_candidats.json"

debut = time.time()
con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs;")

# Participation : on ne garde que des comptes, les pourcentages se recalculent à l'affichage.
con.sql(f"""
    COPY (SELECT id_brut_miom AS code_bv, inscrits, votants, exprimes
          FROM '{SOURCE}general_results.parquet'
          WHERE id_election = '{SCRUTIN}'
          ORDER BY code_bv)
    TO '{F_PARTICIPATION}' (COMPRESSION zstd)
""")

# Voix : un index de candidat (0 = premier au niveau national) remplace les noms répétés.
con.sql(f"""
    CREATE TABLE voix AS
    SELECT id_brut_miom AS code_bv, no_panneau, nom, prenom, voix
    FROM '{SOURCE}candidats_results.parquet'
    WHERE id_election = '{SCRUTIN}'
""")
con.sql("""
    CREATE TABLE candidats AS
    SELECT (row_number() OVER (ORDER BY sum(voix) DESC) - 1)::INTEGER AS cand,
           no_panneau, nom, prenom, sum(voix)::BIGINT AS voix
    FROM voix
    GROUP BY no_panneau, nom, prenom
""")
con.sql(f"""
    COPY (SELECT v.code_bv, c.cand, v.voix
          FROM voix v JOIN candidats c USING (no_panneau, nom, prenom)
          ORDER BY v.code_bv, c.cand)
    TO '{F_VOIX}' (COMPRESSION zstd)
""")

colonnes = ("cand", "panneau", "nom", "prenom", "voix")
liste = [dict(zip(colonnes, r)) for r in con.sql(
    "SELECT cand, no_panneau, nom, prenom, voix FROM candidats ORDER BY cand").fetchall()]
F_CANDIDATS.write_text(json.dumps(liste, ensure_ascii=False, indent=1), encoding="utf-8")

# Contrôles : conservation des lignes, puis totaux nationaux pour comparaison avec la proclamation.
n_source, somme_voix = con.sql("SELECT count(*), sum(voix) FROM voix").fetchone()
n_sortie = con.sql(f"SELECT count(*) FROM '{F_VOIX}'").fetchone()[0]
assert n_source == n_sortie, f"lignes perdues : {n_source} → {n_sortie}"
inscrits, exprimes = con.sql(f"SELECT sum(inscrits), sum(exprimes) FROM '{F_PARTICIPATION}'").fetchone()
print(f"{SCRUTIN} : {len(liste)} candidats, {n_sortie:,} lignes de voix, {inscrits:,} inscrits, "
      f"{exprimes:,} exprimés, somme des voix {somme_voix:,} ({time.time() - debut:.1f} s)")
for fichier in sorted(SORTIE.glob(f"{SCRUTIN}_*")):
    print(f"  {fichier.name:<36} {fichier.stat().st_size / 1e6:6.2f} Mo")
