"""Couches géographiques légères pour la carte : contours administratifs simplifiés d'Etalab.

Les tuiles vectorielles ADMIN EXPRESS de l'IGN sont inutilisables en vue nationale (une tuile au
zoom 5 pèse 11,4 Mo). Etalab publie les mêmes contours (COG 2026, dérivés d'ADMIN EXPRESS) déjà
simplifiés : on les recopie dans les fichiers publiés, car leur serveur n'autorise pas la lecture
directe depuis le navigateur (pas d'en-tête CORS).

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.geo
"""
import csv
import gzip
import json
import tempfile
import time
import urllib.request
from pathlib import Path

import duckdb

from .config import CONTOURS_CODES, PASSAGE_COMMUNES, PUBLICATION

MILLESIME = 2026
SOURCE = "https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/{millesime}/geojson/{nom}.geojson.gz"
# Résolution choisie par couche : 1 000 m pour la vue nationale des communes, 100 m pour des
# limites départementales qui restent justes quand on zoome sur les bureaux.
COUCHES = {"communes": "communes-1000m", "departements": "departements-100m", "regions": "regions-1000m"}

# Territoires des résultats absents du découpage départemental d'Etalab : collectivités d'outre-mer
# et Français établis hors de France. Ils ont un nom, pas de contour.
AUTRES_TERRITOIRES = {
    "975": "Saint-Pierre-et-Miquelon",
    "977": "Saint-Barthélemy",
    "978": "Saint-Martin",
    "986": "Wallis-et-Futuna",
    "987": "Polynésie française",
    "988": "Nouvelle-Calédonie",
    "ZZ": "Français établis hors de France",
}


def telecharger(nom: str) -> dict:
    url = SOURCE.format(millesime=MILLESIME, nom=nom)
    requete = urllib.request.Request(url, headers={"User-Agent": "atlas-electoral-pipeline"})
    with urllib.request.urlopen(requete, timeout=120) as reponse:
        return json.loads(gzip.decompress(reponse.read()))


def departement_de(code_commune: str) -> str:
    """Même règle que les résultats (construire.DEPARTEMENT) : trois caractères outre-mer, deux ailleurs."""
    return code_commune[:3] if code_commune.startswith(("97", "98")) else code_commune[:2]


def emprise(geometrie: dict | None) -> tuple[float | None, ...]:
    if not geometrie:
        return (None,) * 4
    polygones = [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]
    xs = [x for polygone in polygones for anneau in polygone for x, _ in anneau]
    ys = [y for polygone in polygones for anneau in polygone for _, y in anneau]
    return tuple(round(v, 4) for v in (min(xs), min(ys), max(xs), max(ys)))


def ecrire_territoires(couches: dict[str, dict], chemin: Path) -> int:
    """Nom, département et emprise de chaque département et commune : fil d'Ariane, recherche, cadrage."""
    lignes = []
    for niveau, couche in (("departement", "departements"), ("commune", "communes")):
        for entite in couches[couche]["features"]:
            code, nom = entite["properties"]["code"], entite["properties"]["nom"]
            departement = code if niveau == "departement" else departement_de(code)
            lignes.append((niveau, code, nom, departement, *emprise(entite["geometry"])))
    connus = {ligne[1] for ligne in lignes if ligne[0] == "departement"}
    lignes += [("departement", code, nom, code, None, None, None, None)
               for code, nom in AUTRES_TERRITOIRES.items() if code not in connus]
    with tempfile.TemporaryDirectory() as dossier:
        temporaire = Path(dossier) / "territoires.csv"
        with temporaire.open("w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows(lignes)
        duckdb.sql(f"""
            COPY (SELECT * FROM read_csv('{temporaire.as_posix()}', header = false, columns = {{
                    'niveau': 'VARCHAR', 'code': 'VARCHAR', 'nom': 'VARCHAR', 'departement': 'VARCHAR',
                    'ouest': 'FLOAT', 'sud': 'FLOAT', 'est': 'FLOAT', 'nord': 'FLOAT'}})
                  ORDER BY niveau, code)
            TO '{chemin.as_posix()}' (FORMAT parquet, COMPRESSION zstd)""")
    return len(lignes)


def publier_passage(con, sortie: Path) -> None:
    """Passage vers le COG 2026, pour l'application. « fusion » distingue une commune fusionnée (ses
    résultats anciens additionnent plusieurs communes) d'un code corrigé (même territoire)."""
    if PASSAGE_COMMUNES.exists():
        con.sql(f"""CREATE OR REPLACE TABLE passage AS
                    SELECT ancien, actuel, NOT starts_with(source, 'correction') AS fusion
                    FROM read_csv('{PASSAGE_COMMUNES.as_posix()}', all_varchar = true)""")
        con.sql(f"COPY passage TO '{(sortie / 'passage_communes.parquet').as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
    else:
        con.sql("CREATE OR REPLACE TABLE passage (ancien VARCHAR, actuel VARCHAR, fusion BOOLEAN)")


def main() -> None:
    sortie = PUBLICATION / "geo"
    sortie.mkdir(parents=True, exist_ok=True)
    couches = {}
    for couche, nom in COUCHES.items():
        debut = time.time()
        collection = telecharger(nom)
        # On ne garde que le code et le nom : les autres propriétés alourdiraient chaque chargement.
        for entite in collection["features"]:
            p = entite["properties"]
            entite["properties"] = {"code": p.get("code"), "nom": p.get("nom")}
        chemin = sortie / f"{couche}.geojson"
        chemin.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{couche} : {len(collection['features']):,} entités, {chemin.stat().st_size / 1e6:.2f} Mo "
              f"(source {nom}, {time.time() - debut:.0f} s)")
        couches[couche] = collection
    chemin = sortie / "territoires.parquet"
    n = ecrire_territoires(couches, chemin)
    print(f"territoires : {n:,} lignes, {chemin.stat().st_size / 1e3:.0f} Ko")
    # Correspondance bureau → commune des contours de bureaux, pour colorer les bureaux au niveau communal.
    # Les communes fusionnées depuis 2022 y prennent leur code du COG 2026, comme les agrégats.
    con = duckdb.connect()
    publier_passage(con, sortie)
    con.sql(f"""
        COPY (SELECT c.code_bv, coalesce(p.actuel, c.code_commune) AS code_commune, c.code_circonscription
              FROM '{CONTOURS_CODES.as_posix()}' c LEFT JOIN passage p ON p.ancien = c.code_commune ORDER BY c.code_bv)
        TO '{(sortie / 'bureaux_contours_2022.parquet').as_posix()}' (FORMAT parquet, COMPRESSION zstd)""")


if __name__ == "__main__":
    main()
