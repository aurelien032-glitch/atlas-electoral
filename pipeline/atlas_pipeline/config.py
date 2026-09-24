"""Configuration : sources officielles, scrutins de la v1, chemins."""
from dataclasses import dataclass
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
REFERENTIELS = RACINE / "referentiels"
PUBLICATION = RACINE / "publication" / "v1"
CONTOURS_CODES = REFERENTIELS / "contours_bureaux_2022.parquet"
PASSAGE_COMMUNES = REFERENTIELS / "passage_communes_2026.csv"

# Ressources data.gouv.fr. Le lien pérenne suit toujours la version courante du fichier.
LIEN_PERENNE = "https://www.data.gouv.fr/api/1/datasets/r/{id}"
RESSOURCES = {
    "general_results": "ff16d511-10c0-405e-9b35-511723948fce",
    "candidats_results": "4d3b35f6-0b22-4415-a24c-419a676312e2",
    "nuances_2026": "15b3e0e5-396b-4423-9556-faed8a52bfa2",
    "contours_bureaux_geojson": "f98165a7-7c37-4705-a181-bcfc943edc73",
    "contours_bureaux_pmtiles": "53b31b93-82bf-4859-ada9-d00b91952f95",
    # Code officiel géographique 2026 (INSEE) : communes au 1er janvier et événements depuis 1943.
    "cog_2026_communes": "c5800591-813b-4ce2-9a3f-739a9c5d9558",
    "cog_2026_mouvements": "1b96750d-08df-433b-a2d1-a8ea7545ece3",
    # Législatives 2024 : résultats officiels par circonscription (le code a disparu des données agrégées).
    "legislatives_2024_t1_circonscriptions": "5163f2e3-1362-4c35-89a0-1934bb74f2d9",
    "legislatives_2024_t2_circonscriptions": "41ed46cd-77c2-4ecc-b8eb-374aa953ca39",
}

# Seuil au-delà duquel un scrutin est cartographié au bureau de vote (part des inscrits de
# métropole rattachés à un contour) ; en dessous, la carte s'arrête à la commune.
SEUIL_CARTE_BUREAUX = 0.98


@dataclass(frozen=True)
class Scrutin:
    id: str
    libelle: str
    date: str
    # Territoire dans lequel une candidature se présente : 'national', 'circonscription' ou 'commune'.
    portee: str
    # Législatives : les données agrégées n'ont plus de code de circonscription depuis 2024. La
    # ressource officielle des résultats par circonscription (clé de RESSOURCES) le rend à chaque
    # candidature, par département, numéro de panneau, nom et prénom.
    circonscriptions: str | None = None


SCRUTINS_V1 = [
    Scrutin("2022_pres_t1", "Présidentielle 2022, 1er tour", "2022-04-10", "national"),
    Scrutin("2022_pres_t2", "Présidentielle 2022, 2d tour", "2022-04-24", "national"),
    Scrutin("2024_euro_t1", "Européennes 2024", "2024-06-09", "national"),
    Scrutin("2024_legi_t1", "Législatives 2024, 1er tour", "2024-06-30", "circonscription", "legislatives_2024_t1_circonscriptions"),
    Scrutin("2024_legi_t2", "Législatives 2024, 2d tour", "2024-07-07", "circonscription", "legislatives_2024_t2_circonscriptions"),
    Scrutin("2026_muni_t1", "Municipales 2026, 1er tour", "2026-03-15", "commune"),
    Scrutin("2026_muni_t2", "Municipales 2026, 2d tour", "2026-03-22", "commune"),
]
