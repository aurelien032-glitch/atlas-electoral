"""Couches géographiques légères pour la carte : contours administratifs simplifiés d'Etalab.

Les tuiles vectorielles ADMIN EXPRESS de l'IGN sont inutilisables en vue nationale (une tuile au
zoom 5 pèse 11,4 Mo). Etalab publie les mêmes contours (COG 2026, dérivés d'ADMIN EXPRESS) déjà
simplifiés : on les recopie dans les fichiers publiés, car leur serveur n'autorise pas la lecture
directe depuis le navigateur (pas d'en-tête CORS).

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.geo
"""
import gzip
import json
import shutil
import time
import urllib.request

from .config import CONTOURS_CODES, PUBLICATION

MILLESIME = 2026
SOURCE = "https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/{millesime}/geojson/{nom}.geojson.gz"
# Résolution choisie par couche : 1 000 m pour la vue nationale des communes, 100 m pour des
# limites départementales qui restent justes quand on zoome sur les bureaux.
COUCHES = {"communes": "communes-1000m", "departements": "departements-100m", "regions": "regions-1000m"}


def telecharger(nom: str) -> dict:
    url = SOURCE.format(millesime=MILLESIME, nom=nom)
    requete = urllib.request.Request(url, headers={"User-Agent": "atlas-electoral-pipeline"})
    with urllib.request.urlopen(requete, timeout=120) as reponse:
        return json.loads(gzip.decompress(reponse.read()))


def main() -> None:
    sortie = PUBLICATION / "geo"
    sortie.mkdir(parents=True, exist_ok=True)
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
    # Correspondance bureau → commune des contours de bureaux, pour colorer les bureaux au niveau communal.
    shutil.copy2(CONTOURS_CODES, sortie / "bureaux_contours_2022.parquet")


if __name__ == "__main__":
    main()
