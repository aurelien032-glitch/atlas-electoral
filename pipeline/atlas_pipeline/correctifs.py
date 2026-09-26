"""Contours locaux des bureaux de vote, là où ceux de 2022 (Etalab) manquent ou ne suivent plus les bureaux
(décisions Q25, Q27, Q28).

- Bordeaux a changé la numérotation de ses bureaux en 2024 (135 de ses 153 bureaux de 2024 sans contour de 2022).
  Bordeaux Métropole publie son découpage en vigueur (Licence Ouverte), lu sans clé ; il porte les numéros des
  scrutins de 2024 et 2026 (son historique exige une clé : les bureaux de 2024 sont dessinés par le découpage
  d'aujourd'hui).
- Paris Centre (1er au 4e arrondissements) a renuméroté ses bureaux en 2024, du 1 au 49 et un bureau 99 :
  découpage de 2024 de la Ville de Paris, en ODbL.
- Alès, Troyes, Belfort, Dieppe et Aurillac manquent aux contours d'Etalab : leur surface y est rattachée, à tort, au
  dernier bureau de la commune au code INSEE précédent (Aimargues, Trouans, Beaucourt, Déville-lès-Rouen,
  Auriac-l'Église), qui déborde ainsi sur la ville. Contours reconstitués selon la méthode de l'Insee, à partir des
  mêmes adresses de 2022, publiés par Cédric Rossi (Licence Ouverte), aux numéros du ministère : ils dessinent Alès
  et, à tout scrutin (`remplace`), ces cinq communes, dont les contours de 2022 s'effacent. Une ville dont un polygone
  n'a pas de numéro (rapprochement manqué : Troyes, Belfort, Dieppe, et Aurillac sans son bureau 9) garde son dessin
  à la commune.

Deux fichiers : correctifs_bureaux.geojson (Licence Ouverte) et correctifs_bureaux_odbl.geojson, à part pour que
l'ODbL (partage à l'identique) ne s'étende pas aux autres données. Chaque source dit ce qu'elle dessine
(`territoires`), à partir de quelle année de scrutin (`depuis`) et comment la citer ; l'application ne l'emploie
que pour un scrutin dont elle porte presque tous les bureaux du territoire, sauf pour les territoires qu'elle
`remplace`, dessinés par elle à tout scrutin.

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.correctifs
"""
import json
import time
import urllib.parse
import urllib.request

from .config import PUBLICATION

BORDEAUX = "https://opendata.bordeaux-metropole.fr"
PARIS = "https://opendata.paris.fr"
METHODE_INSEE = ("https://static.data.gouv.fr/resources/proposition-de-contours-des-bureaux-de-vote-selon-la-methode-"
                 "de-linsee/20240711-174028/contours-bureaux-vote.json")
# Villes absentes des contours d'Etalab, et communes dont le dernier bureau y déborde sur elles (code précédent).
VILLES_METHODE_INSEE = {"30007": "Alès", "15014": "Aurillac", "10387": "Troyes", "90010": "Belfort", "76217": "Dieppe"}
REMPLACEES = {"30006": "Aimargues", "10386": "Trouans", "90009": "Beaucourt", "76216": "Déville-lès-Rouen",
              "15013": "Auriac-l'Église"}
COMMUNES_METHODE_INSEE = {**VILLES_METHODE_INSEE, **REMPLACEES}


def lire(url: str) -> dict:
    requete = urllib.request.Request(url, headers={"User-Agent": "atlas-electoral-pipeline"})
    with urllib.request.urlopen(requete, timeout=600) as reponse:
        return json.load(reponse)


def arrondir(coordonnees):
    """Coordonnées au cent-millième de degré (environ 1 m), assez pour des contours de bureaux."""
    if isinstance(coordonnees[0], (int, float)):
        return [round(coordonnees[0], 5), round(coordonnees[1], 5)]
    return [arrondir(c) for c in coordonnees]


def entite(code_bv: str, geometrie: dict) -> dict:
    return {"type": "Feature", "properties": {"code_bv": code_bv},
            "geometry": {"type": geometrie["type"], "coordinates": arrondir(geometrie["coordinates"])}}


def opendatasoft(portail: str, jeu: str, filtre: str, code) -> tuple[list[dict], str | None]:
    """Jeu d'un portail Opendatasoft, exporté en GeoJSON : entités et date de dernière modification."""
    api = f"{portail}/api/explore/v2.1/catalog/datasets/{jeu}"
    donnees = lire(f"{api}/exports/geojson?where={urllib.parse.quote(filtre)}")
    modifie = lire(api)["metas"]["default"].get("modified")
    return [entite(code(e["properties"]), e["geometry"]) for e in donnees["features"]], modifie


def topojson(url: str, garder) -> list[tuple[dict, dict]]:
    """
    Propriétés et géométrie GeoJSON des objets d'une topologie quantifiée que retient `garder(propriétés)`. Seuls
    leurs arcs sont décodés : le fichier national en compte des millions.
    """
    topo = lire(url)
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    retenues = [(g.get("properties") or {}, g) for objet in topo["objects"].values() for g in objet["geometries"]
                if garder(g.get("properties") or {})]
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

    geometries = []
    for proprietes, g in retenues:
        if g["type"] == "Polygon":
            geometries.append((proprietes, {"type": "Polygon", "coordinates": [anneau(a) for a in g["arcs"]]}))
        elif g["type"] == "MultiPolygon":
            geometries.append((proprietes, {"type": "MultiPolygon", "coordinates": [[anneau(a) for a in p] for p in g["arcs"]]}))
        else:
            raise SystemExit(f"{proprietes} : géométrie {g['type']} inattendue")
    return geometries


def methode_insee() -> tuple[list[str], list[dict]]:
    """Communes retenues et leurs bureaux, dans les contours « méthode de l'Insee » ; pas de numéro inventé."""
    geometries = topojson(METHODE_INSEE, lambda p: p.get("codeCommune") in COMMUNES_METHODE_INSEE)
    sans_numero = {p["codeCommune"] for p, _ in geometries if not p.get("codeBureauVote")}
    for commune in sorted(sans_numero):
        print(f"{COMMUNES_METHODE_INSEE[commune]} : polygone sans numéro de bureau, la commune garde son dessin à la commune")
    if sans_numero & set(REMPLACEES):
        raise SystemExit("une commune aux contours de 2022 faux n'a pas tous ses numéros : rien pour les remplacer")
    gardees = [c for c in COMMUNES_METHODE_INSEE if c not in sans_numero]
    return gardees, [entite(f"{p['codeCommune']}_{int(p['codeBureauVote']):04d}", g)
                     for p, g in geometries if p["codeCommune"] in gardees]


def publier(nom: str, sources: list[tuple[dict, list[dict]]]) -> None:
    entites, descriptions = [], []
    for source, liste in sources:
        codes = [e["properties"]["code_bv"] for e in liste]
        if not codes:
            raise SystemExit(f"{source['nom']} : aucun bureau")
        if len(codes) != len(set(codes)):
            raise SystemExit(f"{source['nom']} : bureaux en double")
        entites.extend(liste)
        descriptions.append({**source, "bureaux": len(codes)})
    sortie = PUBLICATION / "geo" / nom
    sortie.parent.mkdir(parents=True, exist_ok=True)
    # « sources » : membre étranger de GeoJSON (RFC 7946, § 6.1), lu par l'application pour citer chaque source.
    sortie.write_text(json.dumps({"type": "FeatureCollection", "sources": descriptions, "features": entites},
                                 ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(entites)} contours de bureaux → {sortie} ({sortie.stat().st_size // 1024} Ko)")


def main() -> None:
    debut = time.time()
    bordeaux, modifie_bordeaux = opendatasoft(BORDEAUX, "el_bureauvote_s", 'insee="33063"',
                                              lambda p: f"33063_{int(p['code']):04d}")
    communes, insee = methode_insee()
    noms = [COMMUNES_METHODE_INSEE[c] for c in communes]
    publier("correctifs_bureaux.geojson", [
        ({"territoires": ["33063"], "remplace": [], "lieu": "Bordeaux", "nom": "Bordeaux Métropole",
          "titre": "découpage en vigueur", "annee": None, "depuis": 2024, "fiche": f"{BORDEAUX}/explore/dataset/el_bureauvote_s/",
          "licence": "Licence Ouverte", "modifie": modifie_bordeaux}, bordeaux),
        ({"territoires": communes, "remplace": sorted(REMPLACEES), "lieu": ", ".join(noms[:-1]) + " et " + noms[-1],
          "nom": "Cédric Rossi", "titre": "découpage reconstitué selon la méthode de l'Insee, à partir des adresses de 2022",
          "annee": 2022, "depuis": 2022, "licence": "Licence Ouverte", "modifie": "2024-07-11",
          "fiche": "https://www.data.gouv.fr/datasets/proposition-de-contours-des-bureaux-de-vote-selon-la-methode-de-linsee/"}, insee),
    ])

    paris, modifie_paris = opendatasoft(PARIS, "secteurs-des-bureaux-de-vote-2024", "arrondissement_bv <= 4",
                                        lambda p: f"75056_{int(p['arrondissement_bv']):02d}{int(p['numero_bv']):02d}")
    publier("correctifs_bureaux_odbl.geojson", [
        ({"territoires": ["75101", "75102", "75103", "75104"], "remplace": [], "lieu": "Paris Centre", "nom": "Ville de Paris",
          "titre": "découpage de 2024", "annee": 2024, "depuis": 2024,
          "fiche": f"{PARIS}/explore/dataset/secteurs-des-bureaux-de-vote-2024/", "licence": "ODbL",
          "modifie": modifie_paris}, paris),
    ])
    print(f"({time.time() - debut:.0f} s)")


if __name__ == "__main__":
    main()
