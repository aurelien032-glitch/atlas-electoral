"""Fonctions du pipeline, sans données publiées : ces tests tournent aussi dans la CI « Vérifications »."""
import gzip
import io
import json
import urllib.error

import duckdb
import pytest

from atlas_pipeline.circonscriptions import DEPARTEMENTS_DU_MINISTERE
from atlas_pipeline.construire import departement_de
from atlas_pipeline.correctifs import numero, territoire_du_bureau
from atlas_pipeline.correctifs import simplifier as simplifier_anneau
from atlas_pipeline.encarts import chemin, simplifier
from atlas_pipeline import geo
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


def test_numero_d_un_bureau_local_comme_dans_les_resultats():
    # Quatre chiffres, ou trois chiffres et une lettre (« 601A » à Strasbourg, « 001A » à Toulouse).
    assert [numero(v) for v in ("12", "0012", 12, "601A", "0001A", "1a")] == ["0012", "0012", "0012", "601A", "001A", "001A"]


def test_territoire_d_un_bureau_local():
    assert [territoire_du_bureau(c) for c in ("75056_0211", "69123_0356", "13055_0901", "33063_1001", "75056_JUS1")]         == ["75102", "69383", "13209", "33063", "75056"]


def test_simplification_d_un_anneau_ferme():
    carre = [[0, 0], [0.5, 0.000001], [1, 0], [1, 1], [0, 1], [0, 0]]
    assert simplifier_anneau(carre, 0.00001) == [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]


def _reponses(monkeypatch, suite):
    """`urlopen` rend, appel après appel, les éléments de `suite` : une exception est levée, un dict est servi
    comme un GeoJSON compressé. Les pauses entre essais sont supprimées."""
    appels = []

    def urlopen(requete, timeout):
        element = suite[len(appels)]
        appels.append(requete.full_url)
        if isinstance(element, Exception):
            raise element
        return io.BytesIO(gzip.compress(json.dumps(element).encode()))

    monkeypatch.setattr(geo.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(geo.time, "sleep", lambda _: None)
    return appels


def _erreur(code):
    return urllib.error.HTTPError("https://exemple", code, "erreur", {}, None)


def test_contours_retentes_apres_une_erreur_serveur(monkeypatch):
    appels = _reponses(monkeypatch, [_erreur(500), _erreur(503), {"features": []}])
    assert geo.telecharger("regions-1000m") == {"features": []}
    assert len(appels) == 3


def test_contours_sans_nouvel_essai_sur_une_erreur_4xx(monkeypatch):
    appels = _reponses(monkeypatch, [_erreur(404), {"features": []}])
    with pytest.raises(urllib.error.HTTPError):
        geo.telecharger("regions-1000m")
    assert len(appels) == 1


def test_contours_abandonnes_apres_le_dernier_essai(monkeypatch):
    appels = _reponses(monkeypatch, [_erreur(500)] * geo.ESSAIS)
    with pytest.raises(urllib.error.HTTPError):
        geo.telecharger("regions-1000m")
    assert len(appels) == geo.ESSAIS
