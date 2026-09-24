"""Extrait la liste des bureaux présents dans les contours officiels, sans la géométrie.

Le résultat (quelques centaines de Ko) sert à mesurer, pour chaque scrutin, la part des
inscrits rattachés à un contour. Il est versionné dans referentiels/.

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.contours                        # lit le GeoJSON officiel (645 Mo) en flux
    python -m atlas_pipeline.contours --source <fichier>     # ou une copie locale du même fichier
"""
import argparse
import time

import duckdb

from .config import CONTOURS_CODES, LIEN_PERENNE, RESSOURCES


def extraire(source: str) -> int:
    if source.startswith("http"):
        source = f"/vsicurl/{source}"
    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    con.sql(f"""
        COPY (SELECT DISTINCT codeBureauVote AS code_bv, codeCommune AS code_commune,
                     codeCirconscription AS code_circonscription
              FROM ST_Read('{source}')
              ORDER BY code_bv)
        TO '{CONTOURS_CODES.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
    """)
    return con.sql(f"SELECT count(*) FROM '{CONTOURS_CODES.as_posix()}'").fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default=LIEN_PERENNE.format(id=RESSOURCES["contours_bureaux_geojson"]))
    args = parser.parse_args()
    debut = time.time()
    n = extraire(args.source)
    print(f"{n:,} bureaux → {CONTOURS_CODES} ({time.time() - debut:.0f} s)")


if __name__ == "__main__":
    main()
