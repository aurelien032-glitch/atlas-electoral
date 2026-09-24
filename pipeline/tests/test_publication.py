"""Contrôles sur les fichiers publiés. Lancer d'abord : python -m atlas_pipeline.construire"""
import csv
import json
from pathlib import Path

import duckdb
import pytest

RACINE = Path(__file__).resolve().parents[2]
PUBLICATION = RACINE / "publication" / "v1"
REFERENTIELS = RACINE / "referentiels"
CATALOGUE = PUBLICATION / "scrutins.json"

if not CATALOGUE.exists():
    pytest.skip("aucune publication : lancer d'abord python -m atlas_pipeline.construire",
                allow_module_level=True)

SCRUTINS = [s["id"] for s in json.loads(CATALOGUE.read_text(encoding="utf-8"))["scrutins"]]


def fichier(scrutin: str, nom: str) -> str:
    return "'" + (PUBLICATION / scrutin / nom).as_posix() + "'"


def manifeste(scrutin: str) -> dict:
    return json.loads((PUBLICATION / scrutin / "scrutin.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def con():
    return duckdb.connect()


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_aucune_ligne_de_voix_perdue(scrutin):
    c = manifeste(scrutin)["compteurs"]
    assert c["lignes_voix"] == c["lignes_voix_source"]


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_votants_egaux_a_blancs_nuls_et_exprimes(con, scrutin):
    # Avant 2016, blancs et nuls sont comptés ensemble (colonne blancs vide).
    n = con.sql(f"""SELECT count(*) FROM {fichier(scrutin, 'bureaux.parquet')}
                    WHERE votants <> coalesce(blancs, 0) + nuls + exprimes""").fetchone()[0]
    assert n == 0


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_votants_superieurs_aux_inscrits_rares_et_traces(con, scrutin):
    # Possible (électeurs admis par décision de justice) mais rare : toléré jusqu'à 0,01 % des
    # bureaux, et chaque cas doit être compté dans le manifeste pour être signalé à l'écran.
    n = con.sql(f"""SELECT count(*) FROM {fichier(scrutin, 'bureaux.parquet')}
                    WHERE votants > inscrits""").fetchone()[0]
    c = manifeste(scrutin)["compteurs"]
    assert n == c["votants_superieurs_aux_inscrits"]
    assert n <= 0.0001 * c["bureaux"]


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_cles_uniques(con, scrutin):
    assert con.sql(f"SELECT count(*) = count(DISTINCT code_bv) FROM {fichier(scrutin, 'bureaux.parquet')}").fetchone()[0]
    assert con.sql(f"SELECT count(*) = count(DISTINCT (code_bv, cand)) FROM {fichier(scrutin, 'voix.parquet')}").fetchone()[0]


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_toute_candidature_a_une_famille_et_un_bloc(con, scrutin):
    n = con.sql(f"""SELECT count(*) FROM {fichier(scrutin, 'candidats.parquet')}
                    WHERE famille IS NULL OR bloc IS NULL""").fetchone()[0]
    assert n == 0


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_somme_des_voix_egale_aux_exprimes(scrutin):
    # Les données sources contiennent quelques anomalies isolées : tolérées jusqu'à 0,1 % des bureaux.
    c = manifeste(scrutin)["compteurs"]
    assert c["somme_voix_differente_des_exprimes"] <= 0.001 * c["bureaux"]


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_agregat_france_egal_a_la_somme_des_bureaux(con, scrutin):
    france = con.sql(f"""SELECT inscrits, exprimes FROM {fichier(scrutin, 'agregats.parquet')}
                         WHERE niveau = 'france'""").fetchone()
    bureaux = con.sql(f"SELECT sum(inscrits), sum(exprimes) FROM {fichier(scrutin, 'bureaux.parquet')}").fetchone()
    assert france == bureaux


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_tete_precalculee_partout_ou_il_y_a_des_suffrages(con, scrutin):
    for nom in ("bureaux.parquet", "agregats.parquet"):
        n = con.sql(f"SELECT count(*) FROM {fichier(scrutin, nom)} WHERE exprimes > 0 AND tete IS NULL").fetchone()[0]
        assert n == 0, nom


def test_reconciliation_avec_les_totaux_officiels():
    with open(REFERENTIELS / "totaux_officiels.csv", encoding="utf-8") as f:
        officiels = [r for r in csv.DictReader(f) if r["id_election"] in SCRUTINS]
    if not officiels:
        pytest.skip("aucun total officiel de référence pour les scrutins publiés")
    for r in officiels:
        totaux = manifeste(r["id_election"])["totaux"]
        for champ in ("inscrits", "votants", "exprimes"):
            assert totaux[champ] == int(r[champ]), f"{r['id_election']} : {champ}"


def test_contours_couvrent_la_presidentielle_2022():
    # Les contours datent de 2022 : pour ce scrutin, presque tous les bureaux doivent être rattachés.
    if "2022_pres_t1" not in SCRUTINS:
        pytest.skip("présidentielle 2022 non publiée")
    jointure = manifeste("2022_pres_t1")["jointure_contours"]
    if jointure is None:
        pytest.skip("référentiel des contours absent")
    assert jointure["taux_inscrits_metropole"] >= 0.99


TERRITOIRES = PUBLICATION / "geo" / "territoires.parquet"


@pytest.mark.skipif(not TERRITOIRES.exists(), reason="lancer d'abord python -m atlas_pipeline.geo")
@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_territoires_nommes(con, scrutin):
    # Chaque département des résultats a un nom. Grâce à la table de passage (question Q10), les communes
    # fusionnées depuis le scrutin sont comptées dans leur commune de 2026 : il ne reste que des codes
    # particuliers (Wallis-et-Futuna agrégé), marginaux en inscrits. Les Français de l'étranger n'ont pas de commune.
    t = "'" + TERRITOIRES.as_posix() + "'"
    agregats = fichier(scrutin, "agregats.parquet")
    sans_nom = con.sql(f"""SELECT count(*) FROM {agregats} WHERE niveau = 'departement'
                           AND code NOT IN (SELECT code FROM {t} WHERE niveau = 'departement')""").fetchone()[0]
    assert sans_nom == 0
    hors_cog = con.sql(f"""SELECT sum(inscrits) FILTER (WHERE code NOT IN (SELECT code FROM {t} WHERE niveau = 'commune'))
                                  / sum(inscrits)
                           FROM {agregats} WHERE niveau = 'commune' AND code NOT LIKE 'ZZ%'""").fetchone()[0]
    assert (hors_cog or 0) < 0.0005


def test_passage_vers_des_communes_de_2026(con):
    passage = "'" + (REFERENTIELS / "passage_communes_2026.csv").as_posix() + "'"
    t = "'" + TERRITOIRES.as_posix() + "'"
    inconnues = con.sql(f"""SELECT count(*) FROM read_csv({passage}, all_varchar = true)
                            WHERE actuel NOT IN (SELECT code FROM {t} WHERE niveau = 'commune')""").fetchone()[0]
    assert inconnues == 0


LEGISLATIVES = [s for s in SCRUTINS if manifeste(s)["portee"] == "circonscription"]


@pytest.mark.parametrize("scrutin", LEGISLATIVES)
def test_circonscriptions_des_legislatives(con, scrutin):
    # Chaque candidature a sa circonscription (fichier officiel par circonscription), et nos totaux par
    # circonscription égalent les totaux officiels (inscrits et exprimés).
    c = manifeste(scrutin)["compteurs"]
    # Réconciliation seulement quand la circonscription vient du fichier officiel (2024) ; de 2012 à 2022,
    # elle vient des données elles-mêmes.
    assert c.get("circonscriptions_ecart_officiel", 0) == 0
    sans = con.sql(f"SELECT count(*) FROM {fichier(scrutin, 'candidats.parquet')} WHERE circonscription IS NULL").fetchone()[0]
    assert sans == 0
    agregees = con.sql(f"""SELECT count(*) FROM {fichier(scrutin, 'agregats.parquet')}
                           WHERE niveau = 'circonscription'""").fetchone()[0]
    assert agregees == c["circonscriptions"] == con.sql(
        f"SELECT count(*) FROM {fichier(scrutin, 'circonscriptions.parquet')}").fetchone()[0]


def test_577_circonscriptions_et_76_elus_au_premier_tour(con):
    assert manifeste("2024_legi_t1")["compteurs"]["circonscriptions"] == 577
    elus = con.sql(f"SELECT count(*) FROM {fichier('2024_legi_t1', 'candidats.parquet')} WHERE elu").fetchone()[0]
    assert elus == 76
