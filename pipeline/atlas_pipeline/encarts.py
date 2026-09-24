"""Encarts de la carte nationale : Paris et la petite couronne, et les cinq départements d'outre-mer.

À l'échelle de la France entière, la petite couronne est illisible et l'outre-mer hors du cadre. On
précalcule pour chaque encart les chemins SVG, déjà projetés et simplifiés, de ses communes et de ses
circonscriptions : l'application les dessine en petites cartes, colorées comme la carte principale.

Sources : contours des communes de l'API Découpage administratif (geo.api.gouv.fr, découpage en
vigueur) ; circonscriptions produites par atlas_pipeline.circonscriptions.

Usage, depuis le dossier pipeline/ (après atlas_pipeline.circonscriptions) :
    python -m atlas_pipeline.encarts
"""
import json
import math
import time
import urllib.request

from .config import PUBLICATION

API = "https://geo.api.gouv.fr/departements/{dep}/communes?format=geojson&geometry=contour&fields=code"

# Taille des encarts, en pixels : la petite couronne, plus dense, a droit à un cadre plus grand.
ENCARTS = [
    {"code": "IDF", "nom": "Paris et petite couronne", "departements": ["75", "92", "93", "94"], "cadre": (180, 110)},
    {"code": "971", "nom": "Guadeloupe", "departements": ["971"], "cadre": (86, 64)},
    {"code": "972", "nom": "Martinique", "departements": ["972"], "cadre": (86, 64)},
    {"code": "973", "nom": "Guyane", "departements": ["973"], "cadre": (86, 64)},
    {"code": "974", "nom": "La Réunion", "departements": ["974"], "cadre": (86, 64)},
    {"code": "976", "nom": "Mayotte", "departements": ["976"], "cadre": (86, 64)},
]
MARGE = 4
TOLERANCE = 0.35  # simplification, en pixels de l'encart


def anneaux(geometrie: dict) -> list[list[list[float]]]:
    """Tous les anneaux (extérieurs et trous) d'un Polygon ou d'un MultiPolygon."""
    polygones = [geometrie["coordinates"]] if geometrie["type"] == "Polygon" else geometrie["coordinates"]
    return [anneau for polygone in polygones for anneau in polygone]


def simplifier(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Douglas-Peucker, itératif : garde les sommets qui s'écartent de plus de `tolerance` pixels."""
    if len(points) < 4:
        return points
    garder = [False] * len(points)
    garder[0] = garder[-1] = True
    piles = [(0, len(points) - 1)]
    while piles:
        debut, fin = piles.pop()
        (xa, ya), (xb, yb) = points[debut], points[fin]
        longueur = math.hypot(xb - xa, yb - ya)
        loin, indice = 0.0, None
        for i in range(debut + 1, fin):
            x, y = points[i]
            d = (abs((xb - xa) * (ya - y) - (xa - x) * (yb - ya)) / longueur) if longueur else math.hypot(x - xa, y - ya)
            if d > loin:
                loin, indice = d, i
        if indice is not None and loin > tolerance:
            garder[indice] = True
            piles += [(debut, indice), (indice, fin)]
    return [p for p, g in zip(points, garder) if g]


def chemin(geometrie: dict, projeter) -> str:
    """Chemin SVG d'une géométrie projetée ; les anneaux réduits à moins de trois sommets disparaissent."""
    morceaux = []
    for anneau in anneaux(geometrie):
        points = simplifier([projeter(lon, lat) for lon, lat in anneau], TOLERANCE)
        if len(points) >= 4:
            morceaux.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points[:-1]) + "Z")
    return "".join(morceaux)


def telecharger(dep: str) -> list[dict]:
    with urllib.request.urlopen(API.format(dep=dep), timeout=120) as reponse:
        return json.loads(reponse.read())["features"]


def construire_encart(encart: dict, communes: list[dict], circonscriptions: list[dict]) -> dict:
    points = [p for f in communes for anneau in anneaux(f["geometry"]) for p in anneau]
    ouest, est = min(p[0] for p in points), max(p[0] for p in points)
    sud, nord = min(p[1] for p in points), max(p[1] for p in points)
    # Projection équirectangulaire locale : à ces latitudes et à cette échelle, la déformation est invisible.
    kx = math.cos(math.radians((sud + nord) / 2))
    largeur, hauteur = encart["cadre"]
    echelle = min((largeur - 2 * MARGE) / ((est - ouest) * kx), (hauteur - 2 * MARGE) / (nord - sud))
    dx = (largeur - (est - ouest) * kx * echelle) / 2
    dy = (hauteur - (nord - sud) * echelle) / 2

    def projeter(lon: float, lat: float) -> tuple[float, float]:
        return dx + (lon - ouest) * kx * echelle, dy + (nord - lat) * echelle

    return {
        "code": encart["code"], "nom": encart["nom"], "largeur": largeur, "hauteur": hauteur,
        "emprise": [round(ouest, 4), round(sud, 4), round(est, 4), round(nord, 4)],
        "communes": {f["properties"]["code"]: chemin(f["geometry"], projeter) for f in communes},
        "circonscriptions": {f["properties"]["code"]: chemin(f["geometry"], projeter) for f in circonscriptions},
    }


def main() -> None:
    debut = time.time()
    source = PUBLICATION / "geo" / "circonscriptions.geojson"
    circonscriptions = json.loads(source.read_text(encoding="utf-8"))["features"] if source.exists() else []
    if not circonscriptions:
        print("Contours des circonscriptions absents : encarts sans circonscriptions (python -m atlas_pipeline.circonscriptions).")
    encarts = []
    for encart in ENCARTS:
        communes = [f for dep in encart["departements"] for f in telecharger(dep)]
        propres = [f for f in circonscriptions if f["properties"]["code"].split("-")[0] in encart["departements"]]
        encarts.append(construire_encart(encart, communes, propres))
        print(f"{encart['nom']} : {len(communes)} communes, {len(propres)} circonscriptions")
    sortie = PUBLICATION / "geo" / "encarts.json"
    sortie.write_text(json.dumps({"version": 1, "encarts": encarts}, ensure_ascii=False, separators=(",", ":")),
                      encoding="utf-8")
    print(f"{sortie} : {sortie.stat().st_size / 1e3:.0f} Ko ({time.time() - debut:.0f} s)")


if __name__ == "__main__":
    main()
