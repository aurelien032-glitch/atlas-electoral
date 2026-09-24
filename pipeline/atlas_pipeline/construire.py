"""Construit les fichiers publiés de l'Atlas électoral (v1).

Lit les Parquet officiels de data.gouv.fr à distance (DuckDB httpfs) : aucune copie brute n'est
conservée. Pour chaque scrutin, écrit dans publication/v1/<scrutin>/ :
  bureaux.parquet        une ligne par bureau : participation, candidature en tête, avance
  voix.parquet           voix par bureau et par candidature (format long)
  candidats.parquet      candidatures : nuance officielle ou attribuée, famille, bloc
  agregats.parquet       participation par commune, département et France
  agregats_voix.parquet  voix par candidature aux mêmes niveaux
  scrutin.json           manifeste : compteurs, totaux, contrôles, empreintes SHA-256
ainsi que publication/v1/scrutins.json (catalogue) et sources.lock.json (versions des sources).

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.construire                  # tous les scrutins de la v1
    python -m atlas_pipeline.construire 2022_pres_t1     # un ou plusieurs scrutins
"""
import argparse
import hashlib
import json
import re
import shutil
import time
from pathlib import Path

import duckdb

from .config import CONTOURS_CODES, PUBLICATION, REFERENTIELS, SCRUTINS_V1, SEUIL_CARTE_BUREAUX, Scrutin
from .sources import verrouiller

EXPRESSION_PORTEE = {"national": "'FR'", "departement": "departement", "commune": "code_commune"}

# Le champ code_departement mélange les codes du ministère (ZA…) et de l'INSEE (971…) selon les
# scrutins : on le déduit du code commune INSEE, qui est homogène.
DEPARTEMENT = ("CASE WHEN code_commune LIKE '97%' OR code_commune LIKE '98%' "
               "THEN left(code_commune, 3) ELSE left(code_commune, 2) END")

# Bureaux de métropole (départements 01 à 95, Corse comprise), pour le taux de jointure.
METROPOLE = r"regexp_matches(code_bv, '^([0-8][0-9]|9[0-5]|2A|2B)[0-9]{3}_')"

NIVEAUX = {"commune": "code_commune", "departement": "departement", "france": "'FR'"}


def chemin_sql(chemin: Path) -> str:
    return "'" + chemin.as_posix().replace("'", "''") + "'"


def ecrire(con, requete: str, chemin: Path) -> None:
    con.sql(f"COPY ({requete}) TO {chemin_sql(chemin)} (FORMAT parquet, COMPRESSION zstd)")


def empreinte(chemin: Path) -> str:
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def charger_referentiels(con) -> bool:
    """Charge les référentiels versionnés ; renvoie True si la liste des contours est disponible."""
    con.sql(f"CREATE OR REPLACE TABLE ref_nuances AS "
            f"SELECT * FROM read_csv({chemin_sql(REFERENTIELS / 'nuances.csv')}, all_varchar = true)")
    con.sql(f"CREATE OR REPLACE TABLE ref_candidats AS "
            f"SELECT * FROM read_csv({chemin_sql(REFERENTIELS / 'candidats_nuances.csv')}, all_varchar = true)")
    if not CONTOURS_CODES.exists():
        return False
    con.sql(f"CREATE OR REPLACE TABLE contours AS SELECT code_bv FROM {chemin_sql(CONTOURS_CODES)}")
    return True


def construire_scrutin(con, scrutin: Scrutin, url_general: str, url_candidats: str,
                       sortie: Path, contours: bool) -> dict:
    if not re.fullmatch(r"\d{4}_[a-z]{4}_t[12]", scrutin.id):
        raise ValueError(f"identifiant de scrutin inattendu : {scrutin.id}")
    debut = time.time()
    dossier = sortie / scrutin.id
    dossier.mkdir(parents=True, exist_ok=True)
    portee = EXPRESSION_PORTEE[scrutin.portee]

    # 1. Lecture distante restreinte au scrutin : DuckDB ne télécharge que les blocs utiles.
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE g AS
        SELECT id_brut_miom AS code_bv, code_commune, {DEPARTEMENT} AS departement,
               inscrits, votants, blancs, nuls, exprimes
        FROM '{url_general}' WHERE id_election = '{scrutin.id}'""")
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE brut AS
        SELECT id_brut_miom AS code_bv, code_commune, {DEPARTEMENT} AS departement,
               no_panneau, nom, prenom, sexe, nuance, liste, libelle_abrege_liste, voix
        FROM '{url_candidats}' WHERE id_election = '{scrutin.id}'""")

    # 2. Candidatures : un candidat ou une liste, dans le territoire où il se présente.
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE brut_cle AS
        SELECT *, {portee} AS portee,
               md5(concat_ws('|', {portee}, coalesce(no_panneau::VARCHAR, ''), coalesce(nom, ''),
                             coalesce(prenom, ''), coalesce(nuance, ''), coalesce(liste, ''),
                             coalesce(libelle_abrege_liste, ''))) AS cle
        FROM brut""")
    con.sql("""
        CREATE OR REPLACE TEMP TABLE cand AS
        SELECT (row_number() OVER (ORDER BY sum(voix) DESC, cle) - 1)::INTEGER AS cand, cle,
               any_value(portee) AS portee, any_value(no_panneau) AS panneau,
               any_value(nom) AS nom, any_value(prenom) AS prenom, any_value(sexe) AS sexe,
               any_value(liste) AS liste, any_value(libelle_abrege_liste) AS liste_abregee,
               any_value(nuance) AS nuance_officielle, sum(voix)::BIGINT AS voix_total
        FROM brut_cle GROUP BY cle""")
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE candidats AS
        SELECT c.*,
               coalesce(c.nuance_officielle, a.nuance, 'NC') AS nuance,
               CASE WHEN c.nuance_officielle IS NOT NULL THEN 'officielle'
                    WHEN a.nuance IS NOT NULL THEN 'attribuée' ELSE 'aucune' END AS origine_nuance,
               n.famille, n.bloc, coalesce(n.cas_limite = 'oui' OR a.cas_limite = 'oui', false) AS cas_limite
        FROM cand c
        LEFT JOIN ref_candidats a ON '{scrutin.id}' LIKE a.election || '%' AND upper(c.nom) = upper(a.nom)
        LEFT JOIN ref_nuances n ON n.code = coalesce(c.nuance_officielle, a.nuance, 'NC')""")
    manquantes = [r[0] for r in con.sql("SELECT DISTINCT nuance FROM candidats WHERE famille IS NULL").fetchall()]
    if manquantes:
        raise SystemExit(f"{scrutin.id} : nuances absentes de referentiels/nuances.csv : {manquantes}")
    sans_nuance = con.sql("SELECT count(*) FROM candidats WHERE origine_nuance = 'aucune' AND portee = 'FR'").fetchone()[0]
    if sans_nuance:
        raise SystemExit(f"{scrutin.id} : {sans_nuance} candidature(s) nationale(s) sans nuance : "
                         "compléter referentiels/candidats_nuances.csv")

    # 3. Voix par bureau et par candidature.
    ecrire(con, """
        SELECT b.code_bv, c.cand, b.voix::INTEGER AS voix
        FROM brut_cle b JOIN cand c USING (cle)
        ORDER BY b.code_bv, c.cand""", dossier / "voix.parquet")

    # 4. Bureaux : participation, candidature en tête et avance sur la deuxième (vue par défaut,
    #    que la carte affiche sans avoir à décoder toutes les voix).
    con.sql("""
        CREATE OR REPLACE TEMP TABLE classement AS
        SELECT b.code_bv, c.cand, b.voix,
               row_number() OVER (PARTITION BY b.code_bv ORDER BY b.voix DESC, c.cand) AS rang
        FROM brut_cle b JOIN cand c USING (cle)""")
    # Le code commune et le département se déduisent du code bureau (« 01001_0001 ») : on ne les
    # répète pas dans ce fichier, chargé à chaque ouverture de la carte.
    ecrire(con, """
        SELECT g.code_bv, g.inscrits, g.votants, g.blancs, g.nuls, g.exprimes,
               CASE WHEN g.exprimes > 0 THEN p.cand END AS tete,
               coalesce(g.exprimes > 0 AND p.voix = s.voix, false) AS egalite,
               CASE WHEN g.exprimes > 0
                    THEN round(10000.0 * (p.voix - coalesce(s.voix, 0)) / g.exprimes)::SMALLINT
               END AS avance_x10000
        FROM g
        LEFT JOIN classement p ON p.code_bv = g.code_bv AND p.rang = 1
        LEFT JOIN classement s ON s.code_bv = g.code_bv AND s.rang = 2
        ORDER BY g.code_bv""", dossier / "bureaux.parquet")

    # 5. Candidatures et agrégats par niveau.
    ecrire(con, """
        SELECT cand, portee, panneau, nom, prenom, sexe, liste, liste_abregee, nuance_officielle,
               nuance, origine_nuance, famille, bloc, cas_limite, voix_total
        FROM candidats ORDER BY cand""", dossier / "candidats.parquet")
    participation = " UNION ALL ".join(f"""
        SELECT '{niveau}' AS niveau, {expr} AS code, sum(inscrits)::INTEGER AS inscrits,
               sum(votants)::INTEGER AS votants, sum(blancs)::INTEGER AS blancs,
               sum(nuls)::INTEGER AS nuls, sum(exprimes)::INTEGER AS exprimes
        FROM g GROUP BY ALL""" for niveau, expr in NIVEAUX.items())
    ecrire(con, f"SELECT * FROM ({participation}) ORDER BY niveau, code", dossier / "agregats.parquet")
    voix = " UNION ALL ".join(f"""
        SELECT '{niveau}' AS niveau, {expr} AS code, c.cand, sum(b.voix)::INTEGER AS voix
        FROM brut_cle b JOIN cand c USING (cle) GROUP BY ALL""" for niveau, expr in NIVEAUX.items())
    ecrire(con, f"SELECT * FROM ({voix}) ORDER BY niveau, code, cand", dossier / "agregats_voix.parquet")

    # 6. Contrôles : les écarts bloquants arrêtent le build, les autres vont dans le manifeste.
    c = {}
    c["bureaux"], c["bureaux_distincts"] = con.sql("SELECT count(*), count(DISTINCT code_bv) FROM g").fetchone()
    c["candidatures"] = con.sql("SELECT count(*) FROM cand").fetchone()[0]
    c["lignes_voix_source"] = con.sql("SELECT count(*) FROM brut").fetchone()[0]
    c["lignes_voix"] = con.sql(f"SELECT count(*) FROM {chemin_sql(dossier / 'voix.parquet')}").fetchone()[0]
    c["participation_incoherente"] = con.sql(
        "SELECT count(*) FROM g WHERE votants <> blancs + nuls + exprimes").fetchone()[0]
    # Plus de votants que d'inscrits : rare mais possible (électeurs admis par décision de justice
    # le jour du vote) ou erreur de saisie. Toléré et tracé ; l'interface le signale.
    c["votants_superieurs_aux_inscrits"] = con.sql(
        "SELECT count(*) FROM g WHERE votants > inscrits").fetchone()[0]
    c["somme_voix_differente_des_exprimes"] = con.sql("""
        SELECT count(*) FROM g JOIN (SELECT code_bv, sum(voix) AS s FROM brut GROUP BY 1) v USING (code_bv)
        WHERE v.s <> g.exprimes""").fetchone()[0]
    if c["lignes_voix"] != c["lignes_voix_source"]:
        raise SystemExit(f"{scrutin.id} : lignes de voix perdues ({c['lignes_voix_source']} → {c['lignes_voix']})")
    if c["bureaux"] != c["bureaux_distincts"]:
        raise SystemExit(f"{scrutin.id} : codes de bureau en double")
    if c["participation_incoherente"]:
        raise SystemExit(f"{scrutin.id} : {c['participation_incoherente']} bureau(x) où votants ≠ blancs + nuls + exprimés")

    jointure = None
    if contours:
        taux = con.sql(f"""
            SELECT sum(inscrits) FILTER (WHERE code_bv IN (SELECT code_bv FROM contours)) / sum(inscrits)
            FROM g WHERE {METROPOLE}""").fetchone()[0] or 0.0
        jointure = {
            "millesime_contours": 2022,
            "taux_inscrits_metropole": round(taux, 4),
            "niveau_carte": "bureau" if taux >= SEUIL_CARTE_BUREAUX else "commune",
        }

    totaux = con.sql("SELECT sum(inscrits), sum(votants), sum(blancs), sum(nuls), sum(exprimes) FROM g").fetchone()
    manifeste = {
        "id": scrutin.id,
        "libelle": scrutin.libelle,
        "date": scrutin.date,
        "portee": scrutin.portee,
        "compteurs": c,
        "totaux": dict(zip(("inscrits", "votants", "blancs", "nuls", "exprimes"), map(int, totaux))),
        "jointure_contours": jointure,
        "fichiers": {f.name: {"octets": f.stat().st_size, "sha256": empreinte(f)}
                     for f in sorted(dossier.glob("*.parquet"))},
        "duree_s": round(time.time() - debut, 1),
    }
    (dossier / "scrutin.json").write_text(json.dumps(manifeste, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifeste


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("scrutins", nargs="*", help="identifiants à construire (défaut : toute la v1)")
    parser.add_argument("--sortie", type=Path, default=PUBLICATION)
    args = parser.parse_args(argv)
    inconnus = set(args.scrutins) - {s.id for s in SCRUTINS_V1}
    if inconnus:
        parser.error(f"scrutins inconnus : {sorted(inconnus)}")
    choisis = [s for s in SCRUTINS_V1 if not args.scrutins or s.id in args.scrutins]

    args.sortie.mkdir(parents=True, exist_ok=True)
    verrou = verrouiller(args.sortie / "sources.lock.json")
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs;")
    contours = charger_referentiels(con)
    if not contours:
        print("Référentiel des contours absent : taux de jointure non mesurés (python -m atlas_pipeline.contours).")

    manifestes = []
    for scrutin in choisis:
        m = construire_scrutin(con, scrutin, verrou["sources"]["general_results"]["url"],
                               verrou["sources"]["candidats_results"]["url"], args.sortie, contours)
        c, j = m["compteurs"], m["jointure_contours"] or {}
        octets = sum(f["octets"] for f in m["fichiers"].values())
        print(f"{scrutin.id} : {c['bureaux']:,} bureaux, {c['candidatures']:,} candidatures, "
              f"{c['lignes_voix']:,} lignes de voix, {octets / 1e6:.2f} Mo, "
              f"carte au niveau {j.get('niveau_carte', '?')} ({100 * j.get('taux_inscrits_metropole', 0):.1f} %), "
              f"{c['somme_voix_differente_des_exprimes']} anomalie(s), {m['duree_s']} s")
        manifestes.append(m)

    (args.sortie / "referentiels").mkdir(exist_ok=True)
    shutil.copy2(REFERENTIELS / "nuances.csv", args.sortie / "referentiels" / "nuances.csv")

    # Catalogue : on fusionne avec les scrutins déjà construits lors d'un passage précédent.
    chemin = args.sortie / "scrutins.json"
    existants = {}
    if chemin.exists():
        existants = {s["id"]: s for s in json.loads(chemin.read_text(encoding="utf-8"))["scrutins"]}
    for m in manifestes:
        existants[m["id"]] = {k: m[k] for k in ("id", "libelle", "date", "portee", "totaux", "jointure_contours")}
    catalogue = {
        "version": 1,
        "genere_le": verrou["releve_le"],
        "sources": {nom: {k: s[k] for k in ("url", "etag", "derniere_modification")}
                    for nom, s in verrou["sources"].items()},
        "scrutins": [existants[s.id] for s in SCRUTINS_V1 if s.id in existants],
    }
    chemin.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
