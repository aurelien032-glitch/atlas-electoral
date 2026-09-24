"""Fonctions du pipeline, sans données publiées : ces tests tournent aussi dans la CI « Vérifications »."""
import duckdb

from atlas_pipeline.circonscriptions import DEPARTEMENTS_DU_MINISTERE
from atlas_pipeline.construire import departement_de
from atlas_pipeline.encarts import chemin, simplifier
from atlas_pipeline.geo import arrondissement_municipal


def test_departement_deduit_du_code_commune():
    codes = ["01001", "2A004", "97101", "97701", "98818", "75056"]
    valeurs = ", ".join(f"('{c}')" for c in codes)
    obtenus = duckdb.sql(f"SELECT {departement_de('code')} FROM (VALUES {valeurs}) t(code)").fetchall()
    assert [d for (d,) in obtenus] == ["01", "2A", "971", "977", "988", "75"]


def test_arrondissements_municipaux_de_paris_lyon_et_marseille():
    assert all(arrondissement_municipal(c) for c in ("75101", "75120", "69381", "69389", "13201", "13216"))
    assert not any(arrondissement_municipal(c) for c in ("75056", "69123", "13055", "75121", "69380", "13217"))


def test_codes_du_ministere_vers_les_codes_insee_d_outre_mer():
    assert DEPARTEMENTS_DU_MINISTERE["ZA"] == "971" and DEPARTEMENTS_DU_MINISTERE["ZM"] == "976"
    # Saint-Barthélemy et Saint-Martin, comme les Français de l'étranger, gardent le code des résultats.
    assert "ZX" not in DEPARTEMENTS_DU_MINISTERE and "ZZ" not in DEPARTEMENTS_DU_MINISTERE


def test_simplification_garde_les_extremites_et_les_angles():
    points = [(0.0, 0.0), (1.0, 0.01), (2.0, 0.0), (2.0, 2.0), (0.0, 0.0)]
    assert simplifier(points, 0.1) == [(0.0, 0.0), (2.0, 0.0), (2.0, 2.0), (0.0, 0.0)]


def test_chemin_svg_d_un_carre():
    carre = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    assert chemin(carre, lambda lon, lat: (10 * lon, 10 * (1 - lat))) == "M0.0,10.0L10.0,10.0L10.0,0.0L0.0,0.0Z"
