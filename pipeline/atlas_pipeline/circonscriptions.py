"""Contours des circonscriptions législatives, par fusion des contours officiels des bureaux de vote.

Aucune couche officielle de circonscriptions n'est publiée en tuiles. Les contours des bureaux de vote
(data.gouv.fr, millésime 2022) portent leur circonscription : on fusionne les bureaux de chaque
circonscription, on simplifie (≈ 60 m) et on écrit une couche GeoJSON compacte pour la carte
(6 Mo, moins de 2 Mo compressés ; chargée seulement pour les législatives). Le
découpage de 2010 vaut pour les législatives de 2012 à 2024. Même méthode que le jeu communautaire
« Contours géographiques des circonscriptions législatives » (data.gouv.fr, 2024), utile pour comparer.

Calcul long (plusieurs minutes), à relancer seulement si les contours des bureaux changent.

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.circonscriptions                     # lit le GeoJSON officiel (645 Mo) en flux
    python -m atlas_pipeline.circonscriptions --source <fichier>  # ou une copie locale du même fichier
"""
import argparse
import json
import time

import duckdb

from .config import LIEN_PERENNE, PUBLICATION, RESSOURCES

# Tolérance de simplification, en degrés (≈ 60 m, soit un à deux pixels au zoom des bureaux) : mesuré
# le 24/09, 30 m donnent 2,9 Mo compressés, 60 m 1,8 Mo, 100 m 1,2 Mo.
TOLERANCE = 0.0006

# Outre-mer : le fichier des contours code les départements à la manière du ministère (« ZA » pour la
# Guadeloupe), les résultats avec le code INSEE (« 971 »). Saint-Barthélemy et Saint-Martin (« ZX ») et
# les Français de l'étranger (« ZZ ») gardent leur code, qui est aussi celui des résultats.
DEPARTEMENTS_DU_MINISTERE = {"ZA": "971", "ZB": "972", "ZC": "973", "ZD": "974", "ZS": "975", "ZM": "976",
                             "ZW": "986", "ZP": "987", "ZN": "988"}


def fusionner(source: str) -> int:
    if source.startswith("http"):
        source = f"/vsicurl/{source}"
    sortie = PUBLICATION / "geo" / "circonscriptions.geojson"
    sortie.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    # Code du fichier (« 6902 », « 2A01 », « ZA01 ») → code des résultats (« 69-02 », « 2A-01 », « 971-01 »).
    departement = "left(codeCirconscription, length(codeCirconscription) - 2)"
    selon_insee = " ".join(f"WHEN '{m}' THEN '{i}'" for m, i in DEPARTEMENTS_DU_MINISTERE.items())
    con.sql(f"""
        CREATE TABLE circo AS
        SELECT CASE {departement} {selon_insee} ELSE {departement} END || '-' || right(codeCirconscription, 2) AS code,
               ST_ReducePrecision(ST_SimplifyPreserveTopology(ST_Union_Agg(ST_MakeValid(geom)), {TOLERANCE}), 0.00001) AS geom
        FROM ST_Read('{source}')
        WHERE codeCirconscription IS NOT NULL
        GROUP BY codeCirconscription""")
    # GeoJSON compact (sans espaces) : un tiers plus léger que la sortie indentée de GDAL.
    entites = [{"type": "Feature", "properties": {"code": code}, "geometry": json.loads(geometrie)}
               for code, geometrie in con.sql("SELECT code, ST_AsGeoJSON(geom) FROM circo ORDER BY code").fetchall()]
    sortie.write_text(json.dumps({"type": "FeatureCollection", "features": entites}, separators=(",", ":")), encoding="utf-8")
    return len(entites)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default=LIEN_PERENNE.format(id=RESSOURCES["contours_bureaux_geojson"]))
    args = parser.parse_args()
    debut = time.time()
    n = fusionner(args.source)
    chemin = PUBLICATION / "geo" / "circonscriptions.geojson"
    print(f"{n} circonscriptions → {chemin} ({chemin.stat().st_size / 1e6:.1f} Mo, {time.time() - debut:.0f} s)")


if __name__ == "__main__":
    main()
