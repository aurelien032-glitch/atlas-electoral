"""Contours locaux des bureaux de vote, là où ceux de 2022 (Etalab) ne suivent plus les bureaux (décision Q25).

Bordeaux a changé la numérotation de ses bureaux fin 2024 : 135 de ses 153 bureaux de 2024 n'ont pas de contour
de 2022. Bordeaux Métropole publie son découpage en vigueur (Licence Ouverte), lu en ligne sans clé ; il porte les
numéros des scrutins de 2024 et de 2026. Son historique exige une clé : c'est donc le découpage d'aujourd'hui qui
dessine les bureaux de 2024, retouchés depuis pour certains. L'application ne l'emploie que pour un scrutin dont
presque tous les bureaux de la commune y figurent.

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.correctifs
"""
import json
import time
import urllib.parse
import urllib.request

from .config import PUBLICATION

PORTAIL = "https://opendata.bordeaux-metropole.fr"
SOURCES = [
    {
        "commune": "33063",
        "nom": "Bordeaux Métropole",
        "jeu": "el_bureauvote_s",
        "fiche": f"{PORTAIL}/explore/dataset/el_bureauvote_s/",
        "licence": "Licence Ouverte",
    },
]


def lire(url: str) -> dict:
    requete = urllib.request.Request(url, headers={"User-Agent": "atlas-electoral-pipeline"})
    with urllib.request.urlopen(requete, timeout=120) as reponse:
        return json.load(reponse)


def arrondir(coordonnees):
    """Coordonnées au cent-millième de degré (environ 1 m), assez pour des contours de bureaux."""
    if isinstance(coordonnees[0], (int, float)):
        return [round(coordonnees[0], 5), round(coordonnees[1], 5)]
    return [arrondir(c) for c in coordonnees]


def main() -> None:
    debut = time.time()
    entites, sources = [], []
    for source in SOURCES:
        filtre = urllib.parse.quote(f'insee="{source["commune"]}"')
        api = f"{PORTAIL}/api/explore/v2.1/catalog/datasets/{source['jeu']}"
        donnees = lire(f"{api}/exports/geojson?where={filtre}")
        metas = lire(api)["metas"]["default"]
        codes = set()
        for entite in donnees["features"]:
            code_bv = f"{source['commune']}_{int(entite['properties']['code']):04d}"
            if code_bv in codes:
                raise SystemExit(f"{source['nom']} : bureau {code_bv} en double")
            codes.add(code_bv)
            geometrie = entite["geometry"]
            entites.append({
                "type": "Feature",
                "properties": {"code_bv": code_bv},
                "geometry": {"type": geometrie["type"], "coordinates": arrondir(geometrie["coordinates"])},
            })
        if not codes:
            raise SystemExit(f"{source['nom']} : aucun bureau")
        sources.append({
            "commune": source["commune"], "nom": source["nom"], "fiche": source["fiche"], "licence": source["licence"],
            "modifie": metas.get("modified"), "bureaux": len(codes),
        })
    sortie = PUBLICATION / "geo" / "correctifs_bureaux.geojson"
    sortie.parent.mkdir(parents=True, exist_ok=True)
    # « sources » : membre étranger de GeoJSON (RFC 7946, § 6.1), lu par l'application pour citer la source.
    sortie.write_text(json.dumps({"type": "FeatureCollection", "sources": sources, "features": entites},
                                 ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(entites)} contours de bureaux → {sortie} ({sortie.stat().st_size // 1024} Ko, {time.time() - debut:.0f} s)")


if __name__ == "__main__":
    main()
