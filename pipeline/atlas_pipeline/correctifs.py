"""Contours locaux des bureaux de vote, là où ceux de 2022 (Etalab) manquent, sont faux ou ne suivent plus les
bureaux (décisions Q25, Q27, Q28), et contour détaillé des communes qui n'en ont aucun.

Chaque source est un découpage publié en open data par une collectivité (ou reconstitué selon la méthode de l'Insee),
aux numéros du ministère. N'en sont retenus que les territoires (communes ; arrondissements à Paris, Lyon et
Marseille) où il porte des numéros que les contours de 2022 n'ont pas : ailleurs, ceux-ci suffisent. Un territoire ne
relève que d'une source, la première de la liste qui le couvre, et une commune dont un polygone n'a pas de numéro
n'est pas reprise (on n'invente pas de numéro). Les sources en ODbL sont publiées à part
(correctifs_bureaux_odbl.geojson), pour que le partage à l'identique ne s'étende pas au reste
(correctifs_bureaux.geojson, Licence Ouverte). L'application n'emploie un découpage que pour les scrutins à partir de
son année (`depuis`) dont il porte presque tous les bureaux du territoire, sauf pour les territoires qu'il remplace
(`remplace`, contours de 2022 faux), à tout scrutin.

Contours de 2022 faux : Troyes, Alès, Belfort, Dieppe et Aurillac y sont rattachées, à tort, au dernier bureau de la
commune au code INSEE précédent (Trouans, Aimargues, Beaucourt, Déville-lès-Rouen, Auriac-l'Église), qui déborde
ainsi sur elles (les bureaux des communes voisines, découpés selon leur commune, n'y débordent pas). Ces cinq
communes sont dessinées par la méthode de l'Insee (Cédric Rossi, Licence Ouverte).

Communes sans aucun contour de bureau (Troyes, Belfort…) : au zoom des bureaux, leur contour détaillé (API Découpage
administratif, IGN) remplace le contour simplifié de la vue nationale (communes_sans_contour.geojson).

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.correctifs
"""
from __future__ import annotations

import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from typing import Callable

import duckdb

from .config import CONTOURS_CODES, LIEN_PERENNE, PUBLICATION

METHODE_INSEE = ("https://static.data.gouv.fr/resources/proposition-de-contours-des-bureaux-de-vote-selon-la-methode-"
                 "de-linsee/20240711-174028/contours-bureaux-vote.json")
# Villes absentes des contours d'Etalab, et communes dont le dernier bureau y déborde sur elles (code précédent).
VILLES_METHODE_INSEE = {"30007": "Alès", "15014": "Aurillac", "10387": "Troyes", "90010": "Belfort", "76217": "Dieppe"}
REMPLACEES = {"30006": "Aimargues", "10386": "Trouans", "90009": "Beaucourt", "76216": "Déville-lès-Rouen",
              "15013": "Auriac-l'Église"}
GRAND_LYON = ("https://data.grandlyon.com/geoserver/{espace}/ows?SERVICE=WFS&VERSION=2.0.0&request=GetFeature"
              "&typename={espace}:{couche}&outputFormat=application/json&SRSNAME=EPSG:4326")
# Paris, Lyon et Marseille : pas de contour à la ville, seulement à ses arrondissements.
VILLES_DECOUPEES = {"75056", "69123", "13055"}
# Simplification des tracés (Douglas-Peucker), en degrés : un mètre pour les bureaux, trois pour les communes.
TOLERANCE_BUREAUX = 0.00001
TOLERANCE_COMMUNES = 0.00003
# Collectivités d'outre-mer : pas de contour de bureau, ni de contour détaillé utile (côtes des atolls très
# découpées) ; leur contour simplifié suffit.
COLLECTIVITES = ("975", "977", "978", "984", "986", "987", "988", "989")


def lire(url: str) -> dict:
    for essai in range(3):
        try:
            requete = urllib.request.Request(url, headers={"User-Agent": "atlas-electoral-pipeline"})
            with urllib.request.urlopen(requete, timeout=600) as reponse:
                return json.load(reponse)
        except (urllib.error.URLError, TimeoutError) as erreur:
            # Une réponse 4xx ne changera pas en réessayant.
            if essai == 2 or (isinstance(erreur, urllib.error.HTTPError) and 400 <= erreur.code < 500):
                raise
            time.sleep(5 * (essai + 1))
    raise AssertionError


def numero(valeur) -> str:
    """Numéro de bureau des résultats : quatre chiffres, ou trois chiffres et une lettre (« 601A »)."""
    m = re.fullmatch(r"0*(\d+)([A-Za-z]?)", str(valeur).strip())
    if not m:
        raise ValueError(f"numéro de bureau illisible : {valeur!r}")
    chiffres, lettre = m.groups()
    return chiffres.zfill(3) + lettre.upper() if lettre else chiffres.zfill(4)


def territoire_du_bureau(code_bv: str) -> str:
    """L'arrondissement à Paris, Lyon et Marseille, tiré du numéro (même règle que construire.ARRONDISSEMENT)."""
    commune, n = code_bv.split("_", 1)
    if commune == "75056" and re.match(r"(0[1-9]|1[0-9]|20)", n):
        return "751" + n[:2]
    if commune == "69123" and re.match(r"0[1-9]", n):
        return "6938" + n[1]
    if commune == "13055" and re.match(r"(0[1-9]|1[0-6])", n):
        return "132" + n[:2]
    return commune


def lyon(p: dict, champ: str = "numero") -> str:
    """Bureau d'une couche de la Métropole de Lyon : les arrondissements de Lyon votent sous le code de la ville."""
    insee = str(p["insee"])
    return f"{'69123' if insee.startswith('6938') else insee}_{numero(p[champ])}"


def depuis_web_mercator(point: list[float]) -> list[float]:
    x, y = point[:2]
    return [math.degrees(x / 6378137), math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2)]


def simplifier(anneau: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker sur un anneau fermé, coordonnées arrondies au cent-millième de degré (environ 1 m)."""
    points = []
    for x, y in ((round(p[0], 5), round(p[1], 5)) for p in anneau):
        if not points or points[-1] != [x, y]:
            points.append([x, y])
    if len(points) < 5:
        return points

    # L'anneau est coupé à son point le plus éloigné du premier ; chaque moitié se simplifie seule (pile, pas de
    # récursion : un contour détaillé compte des milliers de points).
    oppose = max(range(len(points)), key=lambda i: math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]))
    retenus = {0, oppose, len(points) - 1}
    pile = [(0, oppose), (oppose, len(points) - 1)]
    while pile:
        debut, fin = pile.pop()
        (ax, ay), (bx, by) = points[debut], points[fin]
        dx, dy = bx - ax, by - ay
        longueur = math.hypot(dx, dy)
        loin, ecart = None, tolerance
        for i in range(debut + 1, fin):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / longueur if longueur else math.hypot(px - ax, py - ay)
            if d > ecart:
                loin, ecart = i, d
        if loin is not None:
            retenus.add(loin)
            pile += [(debut, loin), (loin, fin)]
    resultat = [points[i] for i in sorted(retenus)]
    return resultat if len(resultat) >= 4 else points


def geometrie(g: dict, projection=None, tolerance: float = TOLERANCE_BUREAUX) -> dict | None:
    """Polygone ou multipolygone simplifié ; None pour une géométrie vide ou d'un autre type."""
    if not g or g.get("type") not in ("Polygon", "MultiPolygon"):
        return None
    polygones = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    sortie = []
    for polygone in polygones:
        anneaux = [simplifier([projection(p) for p in a] if projection else a, tolerance) for a in polygone]
        anneaux = [a for a in anneaux if len(a) >= 4]
        if anneaux:
            sortie.append(anneaux)
    if not sortie:
        return None
    return {"type": "Polygon", "coordinates": sortie[0]} if len(sortie) == 1 else {"type": "MultiPolygon", "coordinates": sortie}


def opendatasoft(portail: str, jeu: str) -> Callable[[], tuple[list[dict], str | None]]:
    """Jeu d'un portail Opendatasoft, exporté en GeoJSON : entités et date de dernière modification."""
    def lire_jeu():
        api = f"https://{portail}/api/explore/v2.1/catalog/datasets/{jeu}"
        return lire(f"{api}/exports/geojson")["features"], lire(api)["metas"]["default"].get("modified")
    return lire_jeu


def geojson(url: str, modifie: str | None = None) -> Callable[[], tuple[list[dict], str | None]]:
    return lambda: (lire(url)["features"], modifie)


def topojson(topo: dict, garder) -> list[dict]:
    """
    Entités (propriétés et géométrie GeoJSON) d'une topologie quantifiée que retient `garder(propriétés)`. Seuls
    leurs arcs sont décodés : le fichier national en compte des millions.
    """
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    arcs: dict[int, list[list[float]]] = {}

    def arc(i: int) -> list[list[float]]:
        if i not in arcs:
            x = y = 0
            points = []
            for dx, dy in topo["arcs"][i]:
                x, y = x + dx, y + dy
                points.append([x * sx + tx, y * sy + ty])
            arcs[i] = points
        return arcs[i]

    def anneau(indices: list[int]) -> list[list[float]]:
        points: list[list[float]] = []
        for i in indices:
            suite = arc(i) if i >= 0 else arc(~i)[::-1]
            points.extend(suite if not points else suite[1:])
        return points

    entites = []
    for objet in topo["objects"].values():
        for g in objet["geometries"]:
            proprietes = g.get("properties") or {}
            if not garder(proprietes):
                continue
            if g["type"] == "Polygon":
                coordonnees = [anneau(a) for a in g["arcs"]]
            elif g["type"] == "MultiPolygon":
                coordonnees = [[anneau(a) for a in p] for p in g["arcs"]]
            else:
                raise SystemExit(f"{proprietes} : géométrie {g['type']} inattendue")
            entites.append({"properties": proprietes, "geometry": {"type": g["type"], "coordinates": coordonnees}})
    return entites


@dataclass
class Source:
    nom: str
    titre: str
    # Année du découpage ; None pour un découpage « en vigueur », sans date.
    annee: int | None
    # Premier scrutin (année) qu'il peut dessiner.
    depuis: int
    licence: str
    fiche: str
    entites: Callable[[], tuple[list[dict], str | None]]
    # Numéro de bureau (« commune_numéro ») d'une entité ; None quand la source n'en donne pas.
    code: Callable[[dict], str | None]
    projection: Callable[[list[float]], list[float]] | None = None
    # Territoires aux contours de 2022 faux, que cette source dessine à tout scrutin.
    remplace: frozenset[str] = frozenset()


def methode_insee() -> tuple[list[dict], str | None]:
    communes = set(VILLES_METHODE_INSEE) | set(REMPLACEES)
    return topojson(lire(METHODE_INSEE), lambda p: p.get("codeCommune") in communes), "2024-07-11"


def code_insee(p: dict) -> str | None:
    return f"{p['codeCommune']}_{numero(p['codeBureauVote'])}" if p.get("codeBureauVote") else None


PARIS, BORDEAUX = "opendata.paris.fr", "opendata.bordeaux-metropole.fr"
SOURCES = [
    Source("Cédric Rossi", "découpage reconstitué selon la méthode de l'Insee, à partir des adresses de 2022", 2022, 2022,
           "Licence Ouverte",
           "https://www.data.gouv.fr/datasets/proposition-de-contours-des-bureaux-de-vote-selon-la-methode-de-linsee/",
           methode_insee, code_insee, remplace=frozenset(REMPLACEES)),
    Source("Bordeaux Métropole", "découpage en vigueur", None, 2024, "Licence Ouverte",
           f"https://{BORDEAUX}/explore/dataset/el_bureauvote_s/", opendatasoft(BORDEAUX, "el_bureauvote_s"),
           lambda p: f"{p['insee']}_{numero(p['code'])}"),
    Source("Ville de Paris", "découpage de 2026", 2026, 2024, "Licence Ouverte",
           f"https://{PARIS}/explore/dataset/secteurs-des-bureaux-de-vote-2026/",
           opendatasoft(PARIS, "secteurs-des-bureaux-de-vote-2026"),
           lambda p: f"75056_{int(p['arrondissement']):02d}{int(p['num_bv']):02d}"),
    Source("Toulouse Métropole", "découpage de 2024", 2024, 2024, "Licence Ouverte",
           "https://data.toulouse-metropole.fr/explore/dataset/elections-2024-bureaux-de-vote/",
           opendatasoft("data.toulouse-metropole.fr", "elections-2024-bureaux-de-vote"),
           lambda p: f"31555_{numero(p['uniq_bdv'])}"),
    Source("Ville de Nantes", "découpage en vigueur", None, 2024, "Licence Ouverte",
           "https://data.nantesmetropole.fr/explore/dataset/244400404_decoupage-geographique-bureaux-vote-nantes/",
           opendatasoft("data.nantesmetropole.fr", "244400404_decoupage-geographique-bureaux-vote-nantes"),
           lambda p: f"{p['code_insee']}_{numero(p['numero_bureau'])}"),
    Source("Ville et Eurométropole de Strasbourg", "découpage de 2026", 2026, 2024, "Licence Ouverte",
           "https://data.strasbourg.eu/explore/dataset/bureaux-de-vote/", opendatasoft("data.strasbourg.eu", "bureaux-de-vote"),
           lambda p: f"67482_{numero(p['id_bureau'])}"),
    Source("Ville de Lyon", "découpage de 2026", 2026, 2024, "Licence Ouverte",
           "https://www.data.gouv.fr/datasets/contours-de-bureaux-de-vote-de-la-commune-de-lyon/",
           geojson(GRAND_LYON.format(espace="ville-de-lyon", couche="lyon.secteurbureauvote")), lyon),
    Source("Métropole de Lyon", "découpage en vigueur", None, 2024, "Licence Ouverte",
           "https://www.data.gouv.fr/datasets/secteurs-des-bureaux-de-vote-de-la-commune-de-la-tour-de-salvagny/",
           geojson(GRAND_LYON.format(espace="ville-de-la-tour-de-salvagny",
                                     couche="secteurs-de-bureaux-de-vote-la-tour-de-salvagny")),
           lambda p: f"69250_{numero(p.get('numero') or p.get('num_bureau') or p.get('numbureau'))}"),
    Source("Ville de Caen", "découpage de 2026", 2026, 2026, "Licence Ouverte",
           "https://www.data.gouv.fr/datasets/sectorisation-des-bureaux-de-vote/",
           geojson(LIEN_PERENNE.format(id="4c4b2d25-522d-45a7-96a1-3494fff1785b")),
           lambda p: f"14118_{numero(p['bureau_v'])}", projection=depuis_web_mercator),
    Source("Saint-Nazaire agglo", "découpage en vigueur", None, 2024, "Licence Ouverte",
           "https://data.agglo-carene.fr/explore/dataset/214401846_secteurs_electoraux_saint-nazaire/",
           opendatasoft("data.agglo-carene.fr", "214401846_secteurs_electoraux_saint-nazaire"),
           lambda p: f"{p['code_insee_commune']}_{numero(p['num_bv'])}"),
    Source("Saint-Nazaire agglo", "découpage en vigueur", None, 2024, "Licence Ouverte",
           "https://data.agglo-carene.fr/explore/dataset/214401325_secteurs-electoraux-pornichet/",
           opendatasoft("data.agglo-carene.fr", "214401325_secteurs-electoraux-pornichet"),
           lambda p: f"{p['code_insee_commune']}_{numero(p['num_bv'])}"),
    Source("Orléans Métropole", "découpage en vigueur", None, 2024, "Licence Ouverte",
           "https://data.orleans-metropole.fr/explore/dataset/administratifadm_secteurs_vote/",
           opendatasoft("data.orleans-metropole.fr", "administratifadm_secteurs_vote"),
           lambda p: f"45234_{numero(p['num_bv'])}"),
    Source("Brest métropole", "découpage de 2026", 2026, 2026, "Licence Ouverte",
           "https://www.data.gouv.fr/datasets/bureaux-de-vote-de-brest-a-partir-du-01-01-2026/",
           geojson("https://geo.brest-metropole.fr/arcgis/rest/services/public/GPB_LIM/MapServer/1610030/query"
                   "?where=1%3D1&outFields=DEPCO,BVOTE&f=geojson&outSR=4326"),
           lambda p: f"{p['DEPCO']}_{numero(p['BVOTE'])}"),
    Source("Rennes Métropole", "découpage en vigueur", None, 2024, "ODbL",
           "https://data.rennesmetropole.fr/explore/dataset/perimetres-bureaux-de-vote/",
           opendatasoft("data.rennesmetropole.fr", "perimetres-bureaux-de-vote"),
           lambda p: f"35238_{numero(p['num_bureau'])}"),
]


def correctifs(etalab: set[str]) -> None:
    pris: dict[str, str] = {}
    fichiers: dict[str, tuple[list[dict], list[dict]]] = {"Licence Ouverte": ([], []), "ODbL": ([], [])}
    for source in SOURCES:
        try:
            entites, modifie = source.entites()
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as erreur:
            # Portail en panne : ses villes gardent les contours de 2022, sauf s'il en corrige de faux.
            if source.remplace:
                raise
            print(f"   {source.nom} : source indisponible ({erreur}), ignorée")
            continue
        remplace = source.remplace
        par_territoire: dict[str, list[tuple[str | None, dict]]] = defaultdict(list)
        illisibles = 0
        for e in entites:
            try:
                code = source.code(e["properties"])
            except (KeyError, TypeError, ValueError):
                code, illisibles = None, illisibles + 1
            g = geometrie(e.get("geometry"), source.projection)
            if g is None:
                continue
            # Polygone sans numéro : sa commune n'est pas reprise (inconnue ici, hors méthode de l'Insee).
            territoire = territoire_du_bureau(code) if code else e["properties"].get("codeCommune", "?")
            par_territoire[territoire].append((code, g))
        if illisibles:
            print(f"   {source.nom} : {illisibles} entité(s) au numéro illisible, écartée(s)")
        retenus = []
        for territoire, bureaux in sorted(par_territoire.items()):
            codes = [c for c, _ in bureaux]
            if None in codes:
                print(f"   {source.nom} : {territoire} a un polygone sans numéro, il garde son dessin")
                continue
            if len(codes) != len(set(codes)):
                raise SystemExit(f"{source.nom} : bureaux en double à {territoire}")
            if territoire in pris or territoire in VILLES_DECOUPEES:
                continue
            nouveaux = [c for c in codes if c not in etalab]
            if territoire not in remplace and not nouveaux:
                continue
            pris[territoire] = source.nom
            retenus.append((territoire, bureaux))
        manquants = set(REMPLACEES) & remplace - {t for t, _ in retenus}
        if manquants:
            raise SystemExit(f"{source.nom} : rien pour remplacer les contours de 2022 de {sorted(manquants)}")
        if not retenus:
            print(f"   {source.nom} : aucun territoire à compléter")
            continue
        entites_publiees, descriptions = fichiers[source.licence]
        entites_publiees.extend({"type": "Feature", "properties": {"code_bv": c}, "geometry": g}
                                for _, bureaux in retenus for c, g in bureaux)
        descriptions.append({
            "territoires": [t for t, _ in retenus], "remplace": sorted(remplace & {t for t, _ in retenus}), "nom": source.nom,
            "titre": source.titre, "annee": source.annee, "depuis": source.depuis, "fiche": source.fiche,
            "licence": source.licence, "modifie": modifie, "bureaux": sum(len(b) for _, b in retenus),
        })
        print(f"   {source.nom} : {len(retenus)} territoire(s), {sum(len(b) for _, b in retenus)} bureaux")
    for licence, nom in (("Licence Ouverte", "correctifs_bureaux.geojson"), ("ODbL", "correctifs_bureaux_odbl.geojson")):
        entites_publiees, descriptions = fichiers[licence]
        # « sources » : membre étranger de GeoJSON (RFC 7946, § 6.1), lu par l'application pour citer chaque source.
        ecrire(nom, {"type": "FeatureCollection", "sources": descriptions, "features": entites_publiees})


def communes_sans_contour(etalab_communes: set[str]) -> None:
    """Contour détaillé des communes (et arrondissements) qui n'ont aucun contour de bureau de 2022."""
    geo = PUBLICATION / "geo"
    territoires = duckdb.sql(f"SELECT niveau, code FROM '{(geo / 'territoires.parquet').as_posix()}' "
                             "WHERE niveau IN ('commune', 'arrondissement')").fetchall()
    simplifiees = {f["properties"]["code"]: f["geometry"]
                   for f in json.loads((geo / "communes.geojson").read_text(encoding="utf-8"))["features"]}
    entites, secours = [], []
    for niveau, code in sorted(territoires, key=lambda t: t[1]):
        if code in etalab_communes or code in VILLES_DECOUPEES:
            continue
        type_ = "&type=arrondissement-municipal" if niveau == "arrondissement" else ""
        g = None
        if not code.startswith(COLLECTIVITES):
            try:
                g = geometrie(lire(f"https://geo.api.gouv.fr/communes/{code}?format=geojson&geometry=contour{type_}")
                              .get("geometry"), tolerance=TOLERANCE_COMMUNES)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                secours.append(code)
        if g is None:
            g = geometrie(simplifiees.get(code), tolerance=TOLERANCE_COMMUNES)
        if g is not None:
            entites.append({"type": "Feature", "properties": {"code": code}, "geometry": g})
    if secours:
        print(f"   contour simplifié faute de contour détaillé : {', '.join(secours)}")
    ecrire("communes_sans_contour.geojson", {"type": "FeatureCollection", "features": entites})


def ecrire(nom: str, contenu: dict) -> None:
    sortie = PUBLICATION / "geo" / nom
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(json.dumps(contenu, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(contenu['features'])} contours → {sortie} ({sortie.stat().st_size // 1024} Ko)")


def main() -> None:
    debut = time.time()
    # Contours de 2022 tels que l'application les lit (communes au COG 2026), sinon le référentiel.
    publies = PUBLICATION / "geo" / "bureaux_contours_2022.parquet"
    lignes = duckdb.sql(f"SELECT code_bv, code_commune FROM '{(publies if publies.exists() else CONTOURS_CODES).as_posix()}'").fetchall()
    correctifs({code for code, _ in lignes})
    communes_sans_contour({territoire_du_bureau(code) for code, _ in lignes} | {commune for _, commune in lignes})
    print(f"({time.time() - debut:.0f} s)")


if __name__ == "__main__":
    main()
