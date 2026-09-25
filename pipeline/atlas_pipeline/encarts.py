"""Encarts de la carte nationale : Paris et la petite couronne, les départements et collectivités d'outre-mer.

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
# Paris : ses arrondissements, qui ont leurs propres résultats (niveau « arrondissement » des agrégats).
API_ARRONDISSEMENTS = ("https://geo.api.gouv.fr/communes?codeDepartement={dep}&type=arrondissement-municipal"
                       "&format=geojson&geometry=contour&fields=code")

# Taille des encarts, en pixels : la petite couronne, plus dense, a droit à un cadre plus grand ; l'outre-mer
# tient en trois colonnes de sa largeur. « court » : légende de l'encart quand le nom n'y tient pas.
PETIT = (70, 52)
ENCARTS = [
    {"code": "IDF", "nom": "Paris et petite couronne", "departements": ["75", "92", "93", "94"], "cadre": (226, 134),
     "par_arrondissement": ["75"]},
    {"code": "971", "nom": "Guadeloupe", "departements": ["971"], "cadre": PETIT},
    {"code": "972", "nom": "Martinique", "departements": ["972"], "cadre": PETIT},
    {"code": "973", "nom": "Guyane", "departements": ["973"], "cadre": PETIT},
    {"code": "974", "nom": "La Réunion", "departements": ["974"], "cadre": PETIT},
    {"code": "976", "nom": "Mayotte", "departements": ["976"], "cadre": PETIT},
    {"code": "975", "nom": "Saint-Pierre-et-Miquelon", "court": "St-Pierre-et-Miquelon", "departements": ["975"], "cadre": PETIT},
    {"code": "977", "nom": "Saint-Barthélemy", "court": "St-Barthélemy", "departements": ["977"], "cadre": PETIT},
    {"code": "978", "nom": "Saint-Martin", "court": "St-Martin", "departements": ["978"], "cadre": PETIT},
    # Un seul territoire dans les résultats (98601) ; ses deux groupes d'îles, à 230 km l'un de l'autre, occupent
    # chacun une moitié de l'encart : Wallis (Uvea) à gauche, Futuna et Alofi (Alo, Sigave) à droite.
    {"code": "986", "nom": "Wallis-et-Futuna", "departements": ["986"], "cadre": PETIT, "fusion": "98601",
     "moities": [["98613"], ["98611", "98612"]]},
    # 48 communes sur 2 000 km, invisibles à cette taille : l'encart montre Tahiti et Moorea (îles du Vent, trois
    # habitants sur quatre) ; son nom recadre la carte principale sur tout le territoire.
    {"code": "987", "nom": "Polynésie française", "court": "Polynésie", "departements": ["987"], "cadre": PETIT,
     "recadrage": (-150.0, -17.92, -149.1, -17.44), "note": "Tahiti et Moorea ; les autres îles sur la carte principale"},
    {"code": "988", "nom": "Nouvelle-Calédonie", "departements": ["988"], "cadre": PETIT},
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


def boite(entites: list[dict]) -> tuple[float, float, float, float]:
    """Emprise (ouest, sud, est, nord) d'un ensemble d'entités GeoJSON."""
    points = [p for f in entites for anneau in anneaux(f["geometry"]) for p in anneau]
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def projection(emprise: tuple[float, float, float, float], cadre: tuple[float, float, float, float]):
    """Projette une emprise dans un cadre (x, y, largeur, hauteur) de l'encart, centrée, marges comprises.
    Équirectangulaire locale : à ces latitudes et à cette échelle, la déformation est invisible."""
    ouest, sud, est, nord = emprise
    x0, y0, largeur, hauteur = cadre
    kx = math.cos(math.radians((sud + nord) / 2))
    echelle = min((largeur - 2 * MARGE) / ((est - ouest) * kx), (hauteur - 2 * MARGE) / (nord - sud))
    dx = x0 + (largeur - (est - ouest) * kx * echelle) / 2
    dy = y0 + (hauteur - (nord - sud) * echelle) / 2
    return lambda lon, lat: (dx + (lon - ouest) * kx * echelle, dy + (nord - lat) * echelle)


def chemin(geometrie: dict, projeter, garder: tuple[float, float, float, float] | None = None) -> str:
    """Chemin SVG d'une géométrie projetée ; les anneaux réduits à moins de trois sommets disparaissent, comme,
    si `garder` est donnée, ceux qui tombent entièrement hors de cette emprise."""
    morceaux = []
    for anneau in anneaux(geometrie):
        if garder and not any(garder[0] <= lon <= garder[2] and garder[1] <= lat <= garder[3] for lon, lat in anneau):
            continue
        points = simplifier([projeter(lon, lat) for lon, lat in anneau], TOLERANCE)
        if len(points) >= 4:
            morceaux.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points[:-1]) + "Z")
    return "".join(morceaux)


def telecharger(dep: str, par_arrondissement: bool = False) -> list[dict]:
    with urllib.request.urlopen((API_ARRONDISSEMENTS if par_arrondissement else API).format(dep=dep), timeout=120) as reponse:
        return json.loads(reponse.read())["features"]


def construire_encart(encart: dict, communes: list[dict], circonscriptions: list[dict]) -> dict:
    largeur, hauteur = encart["cadre"]
    # Le nom de l'encart recadre la carte principale sur tout le territoire, même quand l'encart n'en montre
    # qu'une partie.
    emprise = boite(communes)
    if "moities" in encart:
        # Territoire d'un seul tenant dans les résultats : ses groupes d'îles, chacun dans sa part de l'encart,
        # sous le code des résultats.
        part = largeur / len(encart["moities"])
        chemins = {encart["fusion"]: ""}
        for i, codes in enumerate(encart["moities"]):
            groupe = [f for f in communes if f["properties"]["code"] in codes]
            projeter = projection(boite(groupe), (i * part, 0, part, hauteur))
            chemins[encart["fusion"]] += "".join(chemin(f["geometry"], projeter) for f in groupe)
        traces_circonscriptions: dict[str, str] = {}
    else:
        garder = encart.get("recadrage")
        projeter = projection(garder or emprise, (0, 0, largeur, hauteur))
        chemins = {f["properties"]["code"]: chemin(f["geometry"], projeter, garder) for f in communes}
        traces_circonscriptions = {f["properties"]["code"]: chemin(f["geometry"], projeter, garder) for f in circonscriptions}
    return {
        "code": encart["code"], "nom": encart["nom"],
        **{cle: encart[cle] for cle in ("court", "note") if cle in encart},
        "largeur": largeur, "hauteur": hauteur,
        "emprise": [round(v, 4) for v in emprise],
        # Communes hors du cadre (Polynésie hors de Tahiti et Moorea) : rien à dessiner.
        "communes": {code: d for code, d in chemins.items() if d},
        "circonscriptions": {code: d for code, d in traces_circonscriptions.items() if d},
    }


def main() -> None:
    debut = time.time()
    source = PUBLICATION / "geo" / "circonscriptions.geojson"
    circonscriptions = json.loads(source.read_text(encoding="utf-8"))["features"] if source.exists() else []
    if not circonscriptions:
        print("Contours des circonscriptions absents : encarts sans circonscriptions (python -m atlas_pipeline.circonscriptions).")
    encarts = []
    for encart in ENCARTS:
        communes = [f for dep in encart["departements"]
                    for f in telecharger(dep, dep in encart.get("par_arrondissement", []))]
        propres = [f for f in circonscriptions if f["properties"]["code"].split("-")[0] in encart["departements"]]
        encarts.append(construire_encart(encart, communes, propres))
        print(f"{encart['nom']} : {len(communes)} communes, {len(propres)} circonscriptions")
    sortie = PUBLICATION / "geo" / "encarts.json"
    sortie.write_text(json.dumps({"version": 1, "encarts": encarts}, ensure_ascii=False, separators=(",", ":")),
                      encoding="utf-8")
    print(f"{sortie} : {sortie.stat().st_size / 1e3:.0f} Ko ({time.time() - debut:.0f} s)")


if __name__ == "__main__":
    main()
