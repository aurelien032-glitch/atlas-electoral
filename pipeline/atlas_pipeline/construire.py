"""Construit les fichiers publiés de l'Atlas électoral (v1).

Lit les Parquet officiels de data.gouv.fr à distance (DuckDB httpfs) : aucune copie brute n'est
conservée. Pour chaque scrutin, écrit dans publication/v1/<scrutin>/ :
  bureaux.parquet        une ligne par bureau : participation, candidature en tête, avance
  voix.parquet           voix par bureau et par candidature (format long)
  candidats.parquet      candidatures : nuance officielle ou attribuée, famille, bloc
  agregats.parquet       participation par commune (COG 2026), circonscription (législatives),
                         département et France
  agregats_voix.parquet  voix par candidature aux mêmes niveaux
  circonscriptions.parquet  législatives : libellé et emprise de chaque circonscription
  panachage/<dép>.parquet   municipales jusqu'en 2020 : candidats des communes au panachage, chargés
                         à l'ouverture de la fiche d'une commune (hors des fichiers principaux)
  scrutin.json           manifeste : compteurs, totaux, contrôles, empreintes SHA-256
ainsi que publication/v1/scrutins.json (catalogue) et sources.lock.json (versions des sources).

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.construire                  # tous les scrutins (1999 à 2026)
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

from .config import (CIRCONSCRIPTIONS_DES_DONNEES, CONTOURS_CODES, LIEN_PERENNE, PASSAGE_COMMUNES, PUBLICATION,
                     REFERENTIELS, RESSOURCES, SCRUTINS, SEUIL_CARTE_BUREAUX, Scrutin)
from .sources import verrouiller

EXPRESSION_PORTEE = {"national": "'FR'", "circonscription": "circonscription", "departement": "departement",
                     "commune": "code_commune"}

# Le champ code_departement mélange les codes du ministère (ZA…) et de l'INSEE (971…) selon les
# scrutins : on le déduit du code commune INSEE, qui est homogène.
def departement_de(colonne: str) -> str:
    return f"CASE WHEN {colonne} LIKE '97%' OR {colonne} LIKE '98%' THEN left({colonne}, 3) ELSE left({colonne}, 2) END"


DEPARTEMENT = departement_de("code_commune")

# Bureaux de métropole (départements 01 à 95, Corse comprise), pour le taux de jointure.
METROPOLE = r"regexp_matches(code_bv, '^([0-8][0-9]|9[0-5]|2A|2B)[0-9]{3}_')"

# Niveaux d'agrégation. La commune est celle du COG 2026 (table de passage), pour correspondre aux
# contours et aux noms ; les bureaux gardent leur code d'origine.
NIVEAUX = {"commune": "commune", "departement": "departement", "france": "'FR'"}

# Département des fichiers officiels par circonscription (« 1 » pour l'Ain, « ZX » pour Saint-Barthélemy
# et Saint-Martin, qui partagent une circonscription), et celui qu'on déduit du code commune.
DEP_OFFICIEL = "CASE WHEN dep = 'ZX' THEN 'ZX' WHEN length(dep) = 1 THEN '0' || dep ELSE dep END"
DEP_RESULTATS = "CASE WHEN b.departement IN ('977', '978') THEN 'ZX' ELSE b.departement END"


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
    # Communes fusionnées depuis le scrutin → commune du COG 2026 (python -m atlas_pipeline.cog).
    if PASSAGE_COMMUNES.exists():
        con.sql(f"CREATE OR REPLACE TABLE passage AS SELECT ancien, actuel "
                f"FROM read_csv({chemin_sql(PASSAGE_COMMUNES)}, all_varchar = true)")
    else:
        print("Table de passage des communes absente : résultats aux communes de leur année (python -m atlas_pipeline.cog).")
        con.sql("CREATE OR REPLACE TABLE passage (ancien VARCHAR, actuel VARCHAR)")
    # Emprises des communes (python -m atlas_pipeline.geo), pour cadrer les circonscriptions.
    territoires = PUBLICATION / "geo" / "territoires.parquet"
    con.sql(f"CREATE OR REPLACE TABLE territoires AS SELECT * FROM {chemin_sql(territoires)}" if territoires.exists()
            else "CREATE OR REPLACE TABLE territoires (niveau VARCHAR, code VARCHAR, ouest FLOAT, sud FLOAT, est FLOAT, nord FLOAT)")
    if not CONTOURS_CODES.exists():
        return False
    con.sql(f"CREATE OR REPLACE TABLE contours AS SELECT code_bv FROM {chemin_sql(CONTOURS_CODES)}")
    return True


def charger_circonscriptions(con, url: str) -> None:
    """Candidatures officielles par circonscription (format large : panneau, nom… de 1 à n) → table longue."""
    con.sql(f"CREATE OR REPLACE TEMP TABLE circo_brut AS "
            f"SELECT * FROM read_csv('{url}', delim = ';', all_varchar = true, header = true)")
    n = max(int(c.rsplit(" ", 1)[1]) for c, *_ in con.sql("DESCRIBE circo_brut").fetchall() if c.startswith("Nom candidat "))
    candidatures = " UNION ALL ".join(f"""
        SELECT "Code département" AS dep, "Code circonscription législative" AS circo,
               "Numéro de panneau {i}" AS panneau, "Nom candidat {i}" AS nom, "Prénom candidat {i}" AS prenom,
               "Elu {i}" AS elu
        FROM circo_brut WHERE "Nom candidat {i}" IS NOT NULL""" for i in range(1, n + 1))
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE circo_candidats AS
        SELECT {DEP_OFFICIEL} AS dep, {DEP_OFFICIEL} || '-' || right(circo, 2) AS circonscription,
               panneau::INTEGER AS panneau, upper(nom) AS nom, upper(prenom) AS prenom,
               coalesce(elu = 'élu', false) AS elu
        FROM ({candidatures})""")
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE circo_officielles AS
        SELECT {DEP_OFFICIEL} || '-' || right(circo, 2) AS circonscription, dep_libelle,
               right(circo, 2)::INTEGER AS numero, inscrits::INTEGER AS inscrits, exprimes::INTEGER AS exprimes
        FROM (SELECT "Code département" AS dep, "Code circonscription législative" AS circo,
                     "Libellé département" AS dep_libelle, "Inscrits" AS inscrits, "Exprimés" AS exprimes
              FROM circo_brut)""")


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
        SELECT s.id_brut_miom AS code_bv, s.code_commune, coalesce(p.actuel, s.code_commune) AS commune,
               {DEPARTEMENT} AS departement, s.libelle_departement, s.code_circonscription,
               s.inscrits, s.votants, s.blancs, s.nuls, s.exprimes
        FROM '{url_general}' s LEFT JOIN passage p ON p.ancien = s.code_commune
        WHERE s.id_election = '{scrutin.id}'""")
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE brut AS
        SELECT s.id_brut_miom AS code_bv, s.code_commune, coalesce(p.actuel, s.code_commune) AS commune,
               {DEPARTEMENT} AS departement, s.no_panneau, s.nom, s.prenom, s.sexe, s.nuance, s.liste,
               s.libelle_abrege_liste, s.voix
        FROM '{url_candidats}' s LEFT JOIN passage p ON p.ancien = s.code_commune
        WHERE s.id_election = '{scrutin.id}'""")

    # 1 bis. Législatives : la circonscription de chaque ligne vient du fichier officiel par
    #        circonscription (département, panneau, nom, prénom). Un bureau n'en a qu'une.
    niveaux = dict(NIVEAUX)
    if scrutin.circonscriptions == CIRCONSCRIPTIONS_DES_DONNEES:
        # 2012-2022 : code des données (« 04 ») et département ; Saint-Barthélemy et Saint-Martin
        # partagent une circonscription (« ZX-01 »), comme dans les fichiers officiels.
        con.sql("""
            CREATE OR REPLACE TEMP TABLE g AS
            SELECT *, CASE WHEN departement IN ('977', '978') THEN 'ZX' ELSE departement END
                      || '-' || lpad(code_circonscription, 2, '0') AS circonscription
            FROM g""")
        sans = con.sql("SELECT count(*) FROM g WHERE code_circonscription IS NULL").fetchone()[0]
        if sans:
            raise SystemExit(f"{scrutin.id} : {sans} bureau(x) sans code de circonscription")
        con.sql("""
            CREATE OR REPLACE TEMP TABLE brut AS
            SELECT b.*, g.circonscription FROM brut b JOIN g USING (code_bv)""")
        niveaux["circonscription"] = "circonscription"
    elif scrutin.circonscriptions:
        charger_circonscriptions(con, LIEN_PERENNE.format(id=RESSOURCES[scrutin.circonscriptions]))
        con.sql(f"""
            CREATE OR REPLACE TEMP TABLE brut AS
            SELECT b.*, o.circonscription FROM brut b LEFT JOIN circo_candidats o
              ON o.dep = {DEP_RESULTATS} AND o.panneau = b.no_panneau
             AND o.nom = upper(b.nom) AND o.prenom = upper(b.prenom)""")
        orphelines = con.sql("SELECT count(*) FROM brut WHERE circonscription IS NULL").fetchone()[0]
        if orphelines:
            raise SystemExit(f"{scrutin.id} : {orphelines} ligne(s) de voix sans circonscription officielle")
        con.sql("""
            CREATE OR REPLACE TEMP TABLE bureau_circo AS
            SELECT code_bv, any_value(circonscription) AS circonscription, count(DISTINCT circonscription) AS n
            FROM brut GROUP BY code_bv""")
        ambigus = con.sql("SELECT count(*) FROM bureau_circo WHERE n > 1").fetchone()[0]
        if ambigus:
            raise SystemExit(f"{scrutin.id} : {ambigus} bureau(x) rattaché(s) à plusieurs circonscriptions")
        con.sql("""
            CREATE OR REPLACE TEMP TABLE g AS
            SELECT g.*, bc.circonscription FROM g LEFT JOIN bureau_circo bc USING (code_bv)""")
        niveaux["circonscription"] = "circonscription"

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
    officiel = bool(scrutin.circonscriptions) and scrutin.circonscriptions != CIRCONSCRIPTIONS_DES_DONNEES
    circo = ("c.portee AS circonscription, o.elu" if officiel
             else "c.portee AS circonscription, NULL::BOOLEAN AS elu" if scrutin.circonscriptions
             else "NULL::VARCHAR AS circonscription, NULL::BOOLEAN AS elu")
    elus = ("LEFT JOIN circo_candidats o ON o.circonscription = c.portee AND o.panneau = c.panneau "
            "AND o.nom = upper(c.nom) AND o.prenom = upper(c.prenom)" if officiel else "")
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE candidats AS
        SELECT c.*, {circo},
               coalesce(c.nuance_officielle, a.nuance, 'NC') AS nuance,
               CASE WHEN c.nuance_officielle IS NOT NULL THEN 'officielle'
                    WHEN a.nuance IS NOT NULL THEN 'attribuée' ELSE 'aucune' END AS origine_nuance,
               n.libelle AS nuance_libelle, n.famille, n.bloc,
               coalesce(n.cas_limite = 'oui' OR a.cas_limite = 'oui', false) AS cas_limite
        FROM cand c
        LEFT JOIN ref_candidats a ON '{scrutin.id}' LIKE a.election || '%'
              AND upper(coalesce(c.nom, c.liste_abregee, c.liste)) = upper(a.nom)
        LEFT JOIN ref_nuances n ON n.code = coalesce(c.nuance_officielle, a.nuance, 'NC')
        {elus}""")
    manquantes = [r[0] for r in con.sql("SELECT DISTINCT nuance FROM candidats WHERE famille IS NULL").fetchall()]
    if manquantes:
        raise SystemExit(f"{scrutin.id} : nuances absentes de referentiels/nuances.csv : {manquantes}")
    sans_nuance = con.sql("SELECT count(*) FROM candidats WHERE origine_nuance = 'aucune' AND portee = 'FR'").fetchone()[0]
    if sans_nuance:
        raise SystemExit(f"{scrutin.id} : {sans_nuance} candidature(s) nationale(s) sans nuance : "
                         "compléter referentiels/candidats_nuances.csv")

    # 2 bis. Panachage (municipales jusqu'en 2020) : dans les petites communes, chaque électeur vote
    #        pour plusieurs candidats (la somme des voix y dépasse les exprimés). Leurs candidats, tous
    #        sans nuance, partent dans des fichiers par département, chargés à la demande ; ils ne
    #        comptent pas dans les agrégats de voix, où leurs voix multiples fausseraient les parts.
    if scrutin.panachage:
        con.sql("""
            CREATE OR REPLACE TEMP TABLE communes_panachage AS
            SELECT g.commune FROM g JOIN (SELECT code_bv, sum(voix) AS s FROM brut GROUP BY 1) v USING (code_bv)
            GROUP BY g.commune HAVING bool_or(v.s > g.exprimes)""")
    else:
        con.sql("CREATE OR REPLACE TEMP TABLE communes_panachage (commune VARCHAR)")
    con.sql("""
        CREATE OR REPLACE TEMP TABLE brut_cle AS
        SELECT *, commune IN (SELECT commune FROM communes_panachage) AS panachage FROM brut_cle""")
    # Fichiers régénérés à chaque construction : ceux d'une construction précédente ne doivent pas survivre.
    for ancien in (dossier / "panachage").glob("*.parquet"):
        ancien.unlink()
    # Un fichier par département de la commune au COG 2026 (celui que l'application déduit du code de la
    # commune), même quand une commune fusionnée venait d'un autre département.
    departements_panachage = [d for (d,) in con.sql(
        f"SELECT DISTINCT {departement_de('commune')} FROM brut_cle WHERE panachage ORDER BY 1").fetchall()]
    if departements_panachage:
        (dossier / "panachage").mkdir(exist_ok=True)
        for dep in departements_panachage:
            ecrire(con, f"""
                SELECT b.code_bv, b.commune, c.cand, c.nom, c.prenom, c.sexe, c.nuance_officielle AS nuance,
                       c.bloc, b.voix::INTEGER AS voix
                FROM brut_cle b JOIN candidats c USING (cle)
                WHERE b.panachage AND {departement_de('b.commune')} = '{dep}'
                ORDER BY b.code_bv, b.voix DESC""", dossier / "panachage" / f"{dep}.parquet")

    # 3. Voix par bureau et par candidature (hors panachage).
    ecrire(con, """
        SELECT b.code_bv, c.cand, b.voix::INTEGER AS voix
        FROM brut_cle b JOIN cand c USING (cle)
        WHERE NOT b.panachage
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
               nuance, nuance_libelle, origine_nuance, famille, bloc, cas_limite, circonscription, elu, voix_total
        FROM candidats
        WHERE cle IN (SELECT cle FROM brut_cle WHERE NOT panachage)
        ORDER BY cand""", dossier / "candidats.parquet")
    participation = " UNION ALL ".join(f"""
        SELECT '{niveau}' AS niveau, {expr} AS code, sum(inscrits)::INTEGER AS inscrits,
               sum(votants)::INTEGER AS votants, sum(blancs)::INTEGER AS blancs,
               sum(nuls)::INTEGER AS nuls, sum(exprimes)::INTEGER AS exprimes,
               -- Exprimés des communes à listes : dénominateur des parts quand le panachage est exclu.
               sum(exprimes) FILTER (WHERE commune NOT IN (SELECT commune FROM communes_panachage))::INTEGER
                 AS exprimes_listes,
               bool_or(commune IN (SELECT commune FROM communes_panachage)) AS panachage
        FROM g GROUP BY ALL""" for niveau, expr in niveaux.items())
    voix = " UNION ALL ".join(f"""
        SELECT '{niveau}' AS niveau, {expr} AS code, c.cand, sum(b.voix)::INTEGER AS voix
        FROM brut_cle b JOIN cand c USING (cle) WHERE NOT b.panachage GROUP BY ALL""" for niveau, expr in niveaux.items())
    con.sql(f"CREATE OR REPLACE TEMP TABLE agr_voix AS {voix}")
    con.sql("""
        CREATE OR REPLACE TEMP TABLE agr_classement AS
        SELECT *, row_number() OVER (PARTITION BY niveau, code ORDER BY voix DESC, cand) AS rang
        FROM (SELECT * FROM agr_voix
              UNION ALL
              SELECT 'commune' AS niveau, b.commune AS code, c.cand, sum(b.voix)::INTEGER AS voix
              FROM brut_cle b JOIN cand c USING (cle) WHERE b.panachage GROUP BY ALL)""")
    # Comme pour les bureaux, la candidature en tête et son avance sont précalculées : la vue
    # nationale (communes) s'affiche sans décoder les voix de chaque candidature.
    ecrire(con, f"""
        SELECT a.*,
               CASE WHEN a.exprimes > 0 THEN p.cand END AS tete,
               coalesce(a.exprimes > 0 AND p.voix = s.voix, false) AS egalite,
               CASE WHEN a.exprimes > 0
                    THEN round(10000.0 * (p.voix - coalesce(s.voix, 0)) / a.exprimes)::SMALLINT
               END AS avance_x10000
        FROM ({participation}) a
        LEFT JOIN agr_classement p ON p.niveau = a.niveau AND p.code = a.code AND p.rang = 1
        LEFT JOIN agr_classement s ON s.niveau = a.niveau AND s.code = a.code AND s.rang = 2
        ORDER BY a.niveau, a.code""", dossier / "agregats.parquet")
    ecrire(con, "SELECT niveau, code, cand, voix FROM agr_voix ORDER BY niveau, code, cand",
           dossier / "agregats_voix.parquet")
    if scrutin.circonscriptions == CIRCONSCRIPTIONS_DES_DONNEES:
        # Même libellé que pour 2024, à partir du nom du département donné par les données.
        con.sql("""
            CREATE OR REPLACE TEMP TABLE circo_officielles AS
            SELECT circonscription, any_value(libelle_departement) AS dep_libelle,
                   right(circonscription, 2)::INTEGER AS numero
            FROM g GROUP BY circonscription""")
    if scrutin.circonscriptions:
        # Libellé (« Rhône, 1re circonscription ») et emprise approchée : celle des communes de ses bureaux.
        ecrire(con, """
            SELECT o.circonscription AS code,
                   o.dep_libelle || ', ' || CASE WHEN o.numero = 1 THEN '1re' ELSE o.numero || 'e' END
                     || ' circonscription' AS libelle,
                   split_part(o.circonscription, '-', 1) AS departement,
                   min(t.ouest) AS ouest, min(t.sud) AS sud, max(t.est) AS est, max(t.nord) AS nord
            FROM circo_officielles o
            LEFT JOIN (SELECT DISTINCT circonscription, commune FROM g) gc ON gc.circonscription = o.circonscription
            LEFT JOIN territoires t ON t.niveau = 'commune' AND t.code = gc.commune
            GROUP BY ALL ORDER BY code""", dossier / "circonscriptions.parquet")

    # 6. Contrôles : les écarts bloquants arrêtent le build, les autres vont dans le manifeste.
    c = {}
    c["bureaux"], c["bureaux_distincts"] = con.sql("SELECT count(*), count(DISTINCT code_bv) FROM g").fetchone()
    c["candidatures"] = con.sql("SELECT count(*) FROM cand").fetchone()[0]
    c["lignes_voix_source"] = con.sql("SELECT count(*) FROM brut").fetchone()[0]
    c["lignes_voix"] = con.sql(f"SELECT count(*) FROM {chemin_sql(dossier / 'voix.parquet')}").fetchone()[0]
    if scrutin.panachage:
        if departements_panachage:
            c["lignes_voix"] += con.sql(
                f"SELECT count(*) FROM {chemin_sql(dossier / 'panachage' / '*.parquet')}").fetchone()[0]
        c["communes_panachage"] = con.sql("SELECT count(*) FROM communes_panachage").fetchone()[0]
        c["candidatures_panachage"] = con.sql(
            "SELECT count(DISTINCT cle) FROM brut_cle WHERE panachage").fetchone()[0]
    # Jusqu'en 2015, les données comptent les blancs avec les nuls (colonne blancs vide) : on garde
    # cette information telle quelle plutôt que d'inventer une répartition.
    c["participation_incoherente"] = con.sql(
        "SELECT count(*) FROM g WHERE votants <> coalesce(blancs, 0) + nuls + exprimes").fetchone()[0]
    c["blancs_distincts"] = con.sql("SELECT count(blancs) > 0 FROM g").fetchone()[0]
    # Plus de votants que d'inscrits : rare mais possible (électeurs admis par décision de justice
    # le jour du vote) ou erreur de saisie. Toléré et tracé ; l'interface le signale.
    c["votants_superieurs_aux_inscrits"] = con.sql(
        "SELECT count(*) FROM g WHERE votants > inscrits").fetchone()[0]
    # Panachage (municipales jusqu'en 2020, petites communes) : chaque électeur vote pour plusieurs
    # candidats, la somme des voix dépasse normalement les exprimés ; ce n'est pas une anomalie.
    panachage = "true" if scrutin.panachage else "false"
    c["somme_voix_differente_des_exprimes"], c["bureaux_panachage"] = con.sql(f"""
        SELECT count(*) FILTER (WHERE v.s <> g.exprimes AND NOT ({panachage} AND v.s > g.exprimes)),
               count(*) FILTER (WHERE {panachage} AND v.s > g.exprimes)
        FROM g JOIN (SELECT code_bv, sum(voix) AS s FROM brut GROUP BY 1) v USING (code_bv)""").fetchone()
    if c["lignes_voix"] != c["lignes_voix_source"]:
        raise SystemExit(f"{scrutin.id} : lignes de voix perdues ({c['lignes_voix_source']} → {c['lignes_voix']})")
    if c["bureaux"] != c["bureaux_distincts"]:
        raise SystemExit(f"{scrutin.id} : codes de bureau en double")
    if c["participation_incoherente"]:
        raise SystemExit(f"{scrutin.id} : {c['participation_incoherente']} bureau(x) où votants ≠ blancs + nuls + exprimés")
    c["communes_recodees"] = con.sql("SELECT count(DISTINCT code_commune) FROM g WHERE commune <> code_commune").fetchone()[0]
    if scrutin.circonscriptions:
        c["circonscriptions"] = con.sql("SELECT count(DISTINCT circonscription) FROM g").fetchone()[0]
    if officiel:
        # Réconciliation avec les totaux officiels par circonscription (tolérée et tracée).
        c["circonscriptions_ecart_officiel"] = con.sql("""
            SELECT count(*) FROM circo_officielles o
            LEFT JOIN (SELECT circonscription, sum(inscrits) AS inscrits, sum(exprimes) AS exprimes FROM g GROUP BY 1) a
              USING (circonscription)
            WHERE a.inscrits IS DISTINCT FROM o.inscrits OR a.exprimes IS DISTINCT FROM o.exprimes""").fetchone()[0]

    jointure = None
    if contours:
        taux = con.sql(f"""
            SELECT sum(inscrits) FILTER (WHERE code_bv IN (SELECT code_bv FROM contours)) / sum(inscrits)
            FROM g WHERE {METROPOLE}""").fetchone()[0] or 0.0
        jointure = {
            "millesime_contours": 2022,
            "taux_inscrits_metropole": round(taux, 4),
            "niveau_carte": "bureau" if scrutin.carte_au_bureau and taux >= SEUIL_CARTE_BUREAUX else "commune",
        }

    totaux = con.sql("SELECT sum(inscrits), sum(votants), sum(blancs), sum(nuls), sum(exprimes) FROM g").fetchone()
    manifeste = {
        "id": scrutin.id,
        "libelle": scrutin.libelle,
        "date": scrutin.date,
        "portee": scrutin.portee,
        "compteurs": c,
        "totaux": dict(zip(("inscrits", "votants", "blancs", "nuls", "exprimes"),
                           (None if v is None else int(v) for v in totaux))),
        "jointure_contours": jointure,
        "fichiers": {f.relative_to(dossier).as_posix(): {"octets": f.stat().st_size, "sha256": empreinte(f)}
                     for f in sorted(dossier.glob("*.parquet")) + sorted(dossier.glob("panachage/*.parquet"))},
        "duree_s": round(time.time() - debut, 1),
    }
    (dossier / "scrutin.json").write_text(json.dumps(manifeste, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifeste


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("scrutins", nargs="*", help="identifiants à construire (défaut : toute la v1)")
    parser.add_argument("--sortie", type=Path, default=PUBLICATION)
    args = parser.parse_args(argv)
    inconnus = set(args.scrutins) - {s.id for s in SCRUTINS}
    if inconnus:
        parser.error(f"scrutins inconnus : {sorted(inconnus)}")
    choisis = [s for s in SCRUTINS if not args.scrutins or s.id in args.scrutins]

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
        octets = sum(f["octets"] for nom, f in m["fichiers"].items() if "/" not in nom)
        a_part = sum(f["octets"] for nom, f in m["fichiers"].items() if "/" in nom)
        print(f"{scrutin.id} : {c['bureaux']:,} bureaux, {c['candidatures']:,} candidatures, "
              f"{c['lignes_voix']:,} lignes de voix, {octets / 1e6:.2f} Mo"
              f"{f' (+ {a_part / 1e6:.2f} Mo de panachage)' if a_part else ''}, "
              f"carte au niveau {j.get('niveau_carte', '?')} ({100 * j.get('taux_inscrits_metropole', 0):.1f} %), "
              f"{c['somme_voix_differente_des_exprimes']} anomalie(s), {m['duree_s']} s")
        manifestes.append(m)

    (args.sortie / "referentiels").mkdir(exist_ok=True)
    # Grille des nuances et totaux officiels : publiés tels quels, la page Méthodologie les affiche.
    for nom in ("nuances.csv", "totaux_officiels.csv"):
        shutil.copy2(REFERENTIELS / nom, args.sortie / "referentiels" / nom)

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
        "scrutins": [existants[s.id] for s in SCRUTINS if s.id in existants],
    }
    chemin.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2), encoding="utf-8")

    # Les séries relisent tous les tours publiés : elles suivent chaque construction, même partielle.
    from .series import construire as construire_series, resume
    print(resume(construire_series(args.sortie)))


if __name__ == "__main__":
    main()
