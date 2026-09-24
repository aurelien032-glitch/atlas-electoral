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
    # Base officielle des codes postaux (La Poste), pour chercher une commune par son code postal.
    "codes_postaux": "008a2dda-2c60-4b63-b910-998f6f818089",
}

# Seuil au-delà duquel un scrutin est cartographié au bureau de vote (part des inscrits de
# métropole rattachés à un contour) ; en dessous, la carte s'arrête à la commune.
SEUIL_CARTE_BUREAUX = 0.98


# Les données agrégées donnent le code de circonscription des législatives de 2012 à 2022 : valeur
# spéciale du champ Scrutin.circonscriptions.
CIRCONSCRIPTIONS_DES_DONNEES = "donnees"


@dataclass(frozen=True)
class Scrutin:
    id: str
    libelle: str
    date: str
    # Territoire dans lequel une candidature se présente : 'national', 'circonscription', 'departement'
    # (cantonales, régionales, européennes par grandes circonscriptions, législatives avant 2012 ; la
    # candidature s'y distingue par son nom) ou 'commune'.
    portee: str
    # Législatives : source de la circonscription de chaque candidature. De 2012 à 2022, le code des
    # données agrégées ; en 2024, où il a disparu, la ressource officielle des résultats par
    # circonscription (clé de RESSOURCES), par département, numéro de panneau, nom et prénom.
    circonscriptions: str | None = None
    # Les contours de bureaux datent de 2022 : avant, un même code de bureau ne garantit pas le même
    # périmètre, et la carte s'arrête à la commune (docs/PLAN.md, § 3.3).
    carte_au_bureau: bool = True
    # Municipales jusqu'en 2020 : dans les petites communes, chaque électeur vote pour plusieurs
    # candidats (panachage) ; la somme des voix y dépasse normalement les exprimés.
    panachage: bool = False


def _s(ident: str, libelle: str, date: str, portee: str, circonscriptions: str | None = None) -> Scrutin:
    return Scrutin(ident, libelle, date, portee, circonscriptions, carte_au_bureau=date >= "2022",
                   panachage="_muni_" in ident and date < "2026")


C = CIRCONSCRIPTIONS_DES_DONNEES

# Tous les scrutins publiés, dans l'ordre chronologique.
SCRUTINS = [
    _s("1999_euro_t1", "Européennes 1999", "1999-06-13", "national"),
    _s("2001_cant_t1", "Cantonales 2001, 1er tour", "2001-03-11", "departement"),
    _s("2001_cant_t2", "Cantonales 2001, 2d tour", "2001-03-18", "departement"),
    _s("2002_pres_t1", "Présidentielle 2002, 1er tour", "2002-04-21", "national"),
    _s("2002_pres_t2", "Présidentielle 2002, 2d tour", "2002-05-05", "national"),
    _s("2002_legi_t1", "Législatives 2002, 1er tour", "2002-06-09", "departement"),
    _s("2002_legi_t2", "Législatives 2002, 2d tour", "2002-06-16", "departement"),
    _s("2004_cant_t1", "Cantonales 2004, 1er tour", "2004-03-21", "departement"),
    _s("2004_cant_t2", "Cantonales 2004, 2d tour", "2004-03-28", "departement"),
    _s("2004_regi_t1", "Régionales 2004, 1er tour", "2004-03-21", "departement"),
    _s("2004_regi_t2", "Régionales 2004, 2d tour", "2004-03-28", "departement"),
    _s("2004_euro_t1", "Européennes 2004", "2004-06-13", "departement"),
    _s("2007_pres_t1", "Présidentielle 2007, 1er tour", "2007-04-22", "national"),
    _s("2007_pres_t2", "Présidentielle 2007, 2d tour", "2007-05-06", "national"),
    _s("2007_legi_t1", "Législatives 2007, 1er tour", "2007-06-10", "departement"),
    _s("2007_legi_t2", "Législatives 2007, 2d tour", "2007-06-17", "departement"),
    _s("2008_cant_t1", "Cantonales 2008, 1er tour", "2008-03-09", "departement"),
    _s("2008_cant_t2", "Cantonales 2008, 2d tour", "2008-03-16", "departement"),
    _s("2008_muni_t1", "Municipales 2008, 1er tour", "2008-03-09", "commune"),
    _s("2008_muni_t2", "Municipales 2008, 2d tour", "2008-03-16", "commune"),
    _s("2009_euro_t1", "Européennes 2009", "2009-06-07", "departement"),
    _s("2010_regi_t1", "Régionales 2010, 1er tour", "2010-03-14", "departement"),
    _s("2010_regi_t2", "Régionales 2010, 2d tour", "2010-03-21", "departement"),
    _s("2011_cant_t1", "Cantonales 2011, 1er tour", "2011-03-20", "departement"),
    _s("2011_cant_t2", "Cantonales 2011, 2d tour", "2011-03-27", "departement"),
    _s("2012_pres_t1", "Présidentielle 2012, 1er tour", "2012-04-22", "national"),
    _s("2012_pres_t2", "Présidentielle 2012, 2d tour", "2012-05-06", "national"),
    _s("2012_legi_t1", "Législatives 2012, 1er tour", "2012-06-10", "circonscription", C),
    _s("2012_legi_t2", "Législatives 2012, 2d tour", "2012-06-17", "circonscription", C),
    _s("2014_muni_t1", "Municipales 2014, 1er tour", "2014-03-23", "commune"),
    _s("2014_muni_t2", "Municipales 2014, 2d tour", "2014-03-30", "commune"),
    _s("2014_euro_t1", "Européennes 2014", "2014-05-25", "departement"),
    _s("2015_dpmt_t1", "Départementales 2015, 1er tour", "2015-03-22", "departement"),
    _s("2015_dpmt_t2", "Départementales 2015, 2d tour", "2015-03-29", "departement"),
    _s("2015_regi_t1", "Régionales 2015, 1er tour", "2015-12-06", "departement"),
    _s("2015_regi_t2", "Régionales 2015, 2d tour", "2015-12-13", "departement"),
    _s("2017_pres_t1", "Présidentielle 2017, 1er tour", "2017-04-23", "national"),
    _s("2017_pres_t2", "Présidentielle 2017, 2d tour", "2017-05-07", "national"),
    _s("2017_legi_t1", "Législatives 2017, 1er tour", "2017-06-11", "circonscription", C),
    _s("2017_legi_t2", "Législatives 2017, 2d tour", "2017-06-18", "circonscription", C),
    _s("2019_euro_t1", "Européennes 2019", "2019-05-26", "national"),
    _s("2020_muni_t1", "Municipales 2020, 1er tour", "2020-03-15", "commune"),
    _s("2020_muni_t2", "Municipales 2020, 2d tour", "2020-06-28", "commune"),
    _s("2021_dpmt_t1", "Départementales 2021, 1er tour", "2021-06-20", "departement"),
    _s("2021_dpmt_t2", "Départementales 2021, 2d tour", "2021-06-27", "departement"),
    _s("2021_regi_t1", "Régionales 2021, 1er tour", "2021-06-20", "departement"),
    _s("2021_regi_t2", "Régionales 2021, 2d tour", "2021-06-27", "departement"),
    _s("2022_pres_t1", "Présidentielle 2022, 1er tour", "2022-04-10", "national"),
    _s("2022_pres_t2", "Présidentielle 2022, 2d tour", "2022-04-24", "national"),
    _s("2022_legi_t1", "Législatives 2022, 1er tour", "2022-06-12", "circonscription", C),
    _s("2022_legi_t2", "Législatives 2022, 2d tour", "2022-06-19", "circonscription", C),
    _s("2024_euro_t1", "Européennes 2024", "2024-06-09", "national"),
    _s("2024_legi_t1", "Législatives 2024, 1er tour", "2024-06-30", "circonscription", "legislatives_2024_t1_circonscriptions"),
    _s("2024_legi_t2", "Législatives 2024, 2d tour", "2024-07-07", "circonscription", "legislatives_2024_t2_circonscriptions"),
    _s("2026_muni_t1", "Municipales 2026, 1er tour", "2026-03-15", "commune"),
    _s("2026_muni_t2", "Municipales 2026, 2d tour", "2026-03-22", "commune"),
]
