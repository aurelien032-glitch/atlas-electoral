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


# Écarts aux totaux officiels que la source ne permet pas de situer (aucun signalement dans le catalogue).
ECARTS_CONNUS = {
    # Seconds tours partiels par nature : le contrôle de couverture ne s'y applique pas. Au 1er tour, la source
    # n'a pas les collectivités d'outre-mer ; en 2007, l'écart d'inscrits est le même aux deux tours.
    "2002_legi_t2": "0,4 % des exprimés",
    "2007_legi_t2": "1,0 % des exprimés",
}


def test_reconciliation_avec_les_totaux_officiels():
    # Nos totaux nationaux égalent la proclamation officielle, ou l'autre version officielle (fichier du
    # ministère), à 0,01 % près. Sinon l'écart est expliqué : territoires absents ou incomplets dans la source
    # et inscrits aberrants (signalés par le catalogue), périmètre d'une source secondaire, ou écart connu.
    with open(REFERENTIELS / "totaux_officiels.csv", encoding="utf-8") as f:
        officiels = [r for r in csv.DictReader(f) if r["id_election"] in SCRUTINS and r["exprimes"]]
    with open(REFERENTIELS / "totaux_officiels_variantes.csv", encoding="utf-8") as f:
        variantes = list(csv.DictReader(f))
    catalogue = {s["id"]: s for s in json.loads(CATALOGUE.read_text(encoding="utf-8"))["scrutins"]}
    assert len(officiels) >= 54
    champs = ("inscrits", "votants", "exprimes")
    for r in officiels:
        i = r["id_election"]
        totaux = manifeste(i)["totaux"]
        versions = [r] + [v for v in variantes if v["id_election"] == i]
        egal = any(all(abs(totaux[k] - int(v[k])) <= 1e-4 * int(v[k]) for k in champs) for v in versions)
        signale = any(catalogue[i].get(k) for k in ("territoires_absents", "territoires_partiels", "inscrits_aberrants"))
        secondaire = r["fiabilite"] == "secondaire" and abs(totaux["exprimes"] - int(r["exprimes"])) <= 0.01 * int(r["exprimes"])
        assert egal or signale or secondaire or i in ECARTS_CONNUS, f"{i} : écart non expliqué aux totaux officiels"
    # Depuis 2010, sans exception : égalité à 0,01 % près à l'une des versions officielles.
    for r in officiels:
        if r["id_election"] >= "2010" and r["fiabilite"] == "officielle":
            t = manifeste(r["id_election"])["totaux"]
            versions = [r] + [v for v in variantes if v["id_election"] == r["id_election"]]
            assert any(all(abs(t[k] - int(v[k])) <= 1e-4 * int(v[k]) for k in champs) for v in versions), r["id_election"]


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


@pytest.mark.skipif(not TERRITOIRES.exists(), reason="lancer d'abord python -m atlas_pipeline.geo")
def test_departements_a_part(con):
    # Le petit fichier des départements, lu avant l'index complet, en est l'extrait exact.
    t = "'" + TERRITOIRES.as_posix() + "'"
    d = "'" + TERRITOIRES.with_name("territoires_departements.parquet").as_posix() + "'"
    ecarts = con.sql(f"""SELECT count(*) FROM (
                           (SELECT * FROM {t} WHERE niveau = 'departement' EXCEPT ALL SELECT * FROM {d})
                           UNION ALL (SELECT * FROM {d} EXCEPT ALL SELECT * FROM {t} WHERE niveau = 'departement'))""").fetchone()[0]
    assert ecarts == 0
    assert con.sql(f"SELECT count(*) FROM {d}").fetchone()[0] >= 101


def test_plusieurs_elections(con):
    # Une commune dont aucun bureau n'a toutes les candidatures réunit plusieurs élections distinctes : jamais
    # aux présidentielles ni aux européennes ; Paris, Lyon et Marseille aux municipales par secteur ; les
    # grandes villes aux législatives.
    codes = lambda s: {c for (c,) in con.sql(f"""SELECT code FROM {fichier(s, 'agregats.parquet')}
                                               WHERE niveau = 'commune' AND plusieurs_elections""").fetchall()}
    # Aux régionales et européennes, une liste est identifiée par département : seules les communes nouvelles à
    # cheval sur deux départements (Vallons-de-l'Erdre, Cormicy…) en réunissent plusieurs.
    passage = "'" + (PUBLICATION / "geo" / "passage_communes.parquet").as_posix() + "'"
    a_cheval = {c for (c,) in con.sql(f"""SELECT DISTINCT actuel FROM {passage}
                                          WHERE left(ancien, 2) <> left(actuel, 2)""").fetchall()}
    for s in SCRUTINS:
        if s.split("_")[1] == "pres":
            assert not codes(s), s
        elif s.split("_")[1] in ("euro", "regi"):
            assert codes(s) <= a_cheval, s
    assert {"75056", "69123", "13055"} <= codes("2020_muni_t1")
    assert {"31555", "75056"} <= codes("2024_legi_t1")


def test_passage_publie_limite_aux_codes_rencontres(con):
    # L'historique dit « née d'une fusion » d'une commune dont un ancien code a des résultats : pas de Lyon
    # (Saint-Rambert-l'Île-Barbe, rattachée en 1963, n'apparaît dans aucun des 56 tours).
    passage = PUBLICATION / "geo" / "passage_communes.parquet"
    if not passage.exists():
        pytest.skip("lancer d'abord python -m atlas_pipeline.geo")
    p = "'" + passage.as_posix() + "'"
    bureaux = ", ".join("'" + (PUBLICATION / s / "bureaux.parquet").as_posix() + "'" for s in SCRUTINS)
    inutiles = con.sql(f"""SELECT count(*) FROM {p} WHERE ancien NOT IN
                           (SELECT DISTINCT split_part(code_bv, '_', 1) FROM read_parquet([{bureaux}]))""").fetchone()[0]
    assert inutiles == 0
    assert con.sql(f"SELECT count(*) FROM {p} WHERE actuel = '69123'").fetchone()[0] == 0


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


SERIES = PUBLICATION / "series"
sans_series = pytest.mark.skipif(not (SERIES / "series.json").exists(),
                                 reason="lancer d'abord python -m atlas_pipeline.series")


@sans_series
@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_series_redonnent_les_agregats_de_la_france(con, scrutin):
    t = "'" + (SERIES / "territoires.parquet").as_posix() + "'"
    attendu = con.sql(f"""SELECT inscrits, votants, exprimes, exprimes_listes FROM {fichier(scrutin, 'agregats.parquet')}
                          WHERE niveau = 'france'""").fetchone()
    serie = f"FROM {t} WHERE niveau = 'france' AND scrutin = '{scrutin}'"
    assert con.sql(f"SELECT inscrits, votants, exprimes, exprimes_listes {serie}").fetchone() == attendu
    voix = con.sql(f"SELECT sum(voix) FROM {fichier(scrutin, 'agregats_voix.parquet')} WHERE niveau = 'france'").fetchone()[0]
    blocs = " + ".join(f"coalesce({b}, 0)" for b in ("EXG", "GAU", "CENT", "DTE", "EXD", "DIV", "NC"))
    assert con.sql(f"SELECT {blocs} {serie}").fetchone()[0] == voix


@sans_series
def test_series_couvrent_chaque_commune_dans_le_fichier_de_son_departement(con):
    assert json.loads((SERIES / "series.json").read_text(encoding="utf-8"))["tours"] == SCRUTINS
    lignes = 0
    for f in (SERIES / "communes").glob("*.parquet"):
        chemin = "'" + f.as_posix() + "'"
        departements = con.sql(f"""SELECT DISTINCT CASE WHEN code LIKE '97%' OR code LIKE '98%' THEN left(code, 3)
                                   ELSE left(code, 2) END FROM {chemin}""").fetchall()
        assert departements == [(f.stem,)]
        lignes += con.sql(f"SELECT count(*) FROM {chemin}").fetchone()[0]
    assert lignes == sum(con.sql(f"SELECT count(*) FROM {fichier(s, 'agregats.parquet')} WHERE niveau = 'commune'")
                         .fetchone()[0] for s in SCRUTINS)


CIRCONSCRIPTIONS_GEO = PUBLICATION / "geo" / "circonscriptions.geojson"


@pytest.mark.skipif(not CIRCONSCRIPTIONS_GEO.exists(), reason="lancer d'abord python -m atlas_pipeline.circonscriptions")
def test_contours_des_circonscriptions_aux_codes_des_resultats(con):
    # Un contour dont le code n'existe pas dans les résultats resterait sans couleur sur la carte.
    contours = {e["properties"]["code"] for e in json.loads(CIRCONSCRIPTIONS_GEO.read_text(encoding="utf-8"))["features"]}
    resultats = {c for (c,) in con.sql(f"""SELECT code FROM {fichier('2024_legi_t1', 'agregats.parquet')}
                                           WHERE niveau = 'circonscription'""").fetchall()}
    assert contours - resultats == set()
    # Sans contour de bureau : Wallis-et-Futuna, Polynésie, Nouvelle-Calédonie, Saint-Barthélemy et
    # Saint-Martin, Français de l'étranger.
    assert {c.split("-")[0] for c in resultats - contours} == {"986", "987", "988", "ZX", "ZZ"}


ENCARTS = PUBLICATION / "geo" / "encarts.json"


@pytest.mark.skipif(not ENCARTS.exists(), reason="lancer d'abord python -m atlas_pipeline.encarts")
def test_encarts_aux_codes_des_resultats(con):
    # Chaque commune et chaque circonscription dessinée dans un encart doit trouver sa couleur.
    encarts = json.loads(ENCARTS.read_text(encoding="utf-8"))["encarts"]
    assert [e["code"] for e in encarts] == ["IDF", "971", "972", "973", "974", "976"]
    communes = {c for (c,) in con.sql(f"""SELECT code FROM {fichier('2022_pres_t1', 'agregats.parquet')}
                                          WHERE niveau IN ('commune', 'arrondissement')""").fetchall()}
    circonscriptions = {c for (c,) in con.sql(f"""SELECT code FROM {fichier('2024_legi_t1', 'agregats.parquet')}
                                                  WHERE niveau = 'circonscription'""").fetchall()}
    for e in encarts:
        assert set(e["communes"]) <= communes, e["code"]
        assert e["circonscriptions"] and set(e["circonscriptions"]) <= circonscriptions, e["code"]
        assert all(e["communes"].values()), e["code"]


@pytest.mark.parametrize("scrutin", SCRUTINS)
def test_arrondissements_de_paris_lyon_et_marseille(con, scrutin):
    # Tirés des numéros de bureau : au plus 20, 9 et 16 arrondissements (moins aux cantonales, renouvelées
    # par moitié). Avec les bureaux hors de la règle, laissés à la ville (dont, à Paris, le bureau du vote
    # par correspondance des personnes détenues, depuis 2019), ils redonnent exactement la ville.
    from atlas_pipeline.construire import ARRONDISSEMENT
    agregats = fichier(scrutin, "agregats.parquet")
    villes = dict(con.sql(f"""SELECT code, inscrits FROM {agregats}
                              WHERE niveau = 'commune' AND code IN ('75056', '69123', '13055')""").fetchall())
    arrondissements = con.sql(f"""
        SELECT CASE WHEN code LIKE '751%' THEN '75056' WHEN code LIKE '6938%' THEN '69123' ELSE '13055' END,
               count(*), sum(inscrits)
        FROM {agregats} WHERE niveau = 'arrondissement' GROUP BY 1""").fetchall()
    maximum = {"75056": 20, "69123": 9, "13055": 16}
    assert {v for v, _, _ in arrondissements} == set(villes)
    for ville, n, inscrits in arrondissements:
        assert 1 <= n <= maximum[ville], ville
        hors = con.sql(f"""SELECT coalesce(sum(inscrits), 0) FROM (
                               SELECT *, left(code_bv, 5) AS commune FROM {fichier(scrutin, 'bureaux.parquet')})
                           WHERE commune = '{ville}' AND ({ARRONDISSEMENT}) IS NULL""").fetchone()[0]
        assert inscrits + hors == villes[ville], ville
        assert hors <= 0.015 * villes[ville], ville


def test_territoires_absents_de_la_source():
    # Depuis 2012, la source couvre tout l'outre-mer et les Français de l'étranger aux scrutins nationaux ;
    # avant, des territoires manquent (présidentielles 2002 et 2007…) : le catalogue les nomme.
    catalogue = {s["id"]: s for s in json.loads(CATALOGUE.read_text(encoding="utf-8"))["scrutins"]}
    nationaux = [i for i in catalogue if i.split("_")[1] in ("pres", "legi", "euro")]
    assert all(not catalogue[i]["territoires_absents"] for i in nationaux if i >= "2012")
    assert {"975", "987", "988", "ZZ"} <= set(catalogue["2007_pres_t1"]["territoires_absents"])
    assert "ZZ" not in catalogue["2007_legi_t1"]["territoires_absents"]  # députés des Français de l'étranger : 2012
    # Européennes de 2004 et 2009 : pas de vote dans les consulats, donc rien à attendre des Français de l'étranger.
    assert "ZZ" not in catalogue["2004_euro_t1"]["territoires_absents"] + catalogue["2009_euro_t1"]["territoires_absents"]


def test_couverture_de_la_source():
    # Départements manquants ou incomplets dans la source, et bureaux aux inscrits aberrants : signalés, jamais
    # corrigés. Constat du 25/09 (comparaison aux scrutins voisins et aux totaux officiels).
    catalogue = {s["id"]: s for s in json.loads(CATALOGUE.read_text(encoding="utf-8"))["scrutins"]}
    partiels = lambda i: {p["code"] for p in catalogue[i]["territoires_partiels"]}
    assert "71" in catalogue["2002_legi_t1"]["territoires_absents"]  # Saône-et-Loire
    assert "50" in catalogue["2004_regi_t1"]["territoires_absents"] and {"06", "63", "974"} <= partiels("2004_regi_t1")
    assert {"06", "50", "974"} <= set(catalogue["2004_regi_t2"]["territoires_absents"])
    assert {"17", "61", "65"} <= set(catalogue["2008_muni_t1"]["territoires_absents"]) and "59" in partiels("2008_muni_t1")
    # Depuis 2010, la source est complète : aucun signalement.
    for i, s in catalogue.items():
        if i >= "2010":
            assert not s["territoires_partiels"] and not s["inscrits_aberrants"], i
    aberrants = {b["code_bv"] for s in catalogue.values() for b in s["inscrits_aberrants"]}
    assert "59512_0164" in aberrants and "75056_JUS1" not in aberrants
