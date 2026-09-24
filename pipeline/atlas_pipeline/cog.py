"""Table de passage des communes vers le code officiel géographique (COG) 2026 de l'INSEE.

Les résultats de 2022 et 2024 portent le code des communes à la date du vote ; les contours et les
noms sont au COG 2026. Une commune fusionnée depuis (commune nouvelle) aurait donc des résultats sans
contour, et sa commune nouvelle un contour sans résultats (question Q10 du plan). La table relie chaque
ancien code à la commune qui le porte au 1er janvier 2026 :
  1. commune déléguée ou associée au COG 2026 → sa commune de rattachement (COMPARENT) ;
  2. sinon, la chaîne des événements (fusions, créations de communes nouvelles…) jusqu'à une commune
     qui existe au 1er janvier 2026.
Les fichiers de l'INSEE sont lus à distance ; seule la table dérivée (quelques milliers de lignes) est
versionnée dans referentiels/.

Usage, depuis le dossier pipeline/ :
    python -m atlas_pipeline.cog
"""
import duckdb

from .config import LIEN_PERENNE, PASSAGE_COMMUNES, RESSOURCES

# Codes des résultats que les événements du COG ne relient pas à une commune de 2026 : vérifiés un à un.
CORRECTIONS = {
    # Communes de Guadeloupe devenues collectivités d'outre-mer le 23 février 2007 (même territoire).
    "97123": ("97701", "Saint-Barthélemy : collectivité depuis 2007"),
    "97127": ("97801", "Saint-Martin : collectivité depuis 2007"),
    # Code erroné dans des fichiers anciens du ministère ; la commune porte le code 26020 depuis 1992.
    "26383": ("26020", "La Répara-Auriples : code erroné des données de 1999 à 2007"),
    # Municipales 2008 en Nouvelle-Calédonie : codes postaux au lieu des codes INSEE (base officielle
    # des codes postaux de La Poste, un code postal par commune).
    "98800": ("98818", "Nouméa : code postal des données de 2008"),
    "98834": ("98832", "Yaté : code postal des données de 2008"),
    "98835": ("98805", "Dumbéa : code postal des données de 2008"),
    "98850": ("98812", "Koumac : code postal des données de 2008"),
    "98860": ("98811", "Koné : code postal des données de 2008"),
    "98870": ("98803", "Bourail : code postal des données de 2008"),
    "98880": ("98813", "La Foa : code postal des données de 2008"),
    "98881": ("98806", "Farino : code postal des données de 2008"),
    "98882": ("98828", "Sarraméa : code postal des données de 2008"),
    "98890": ("98821", "Païta : code postal des données de 2008"),
}


def construire() -> dict[str, int]:
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs;")
    communes = LIEN_PERENNE.format(id=RESSOURCES["cog_2026_communes"])
    mouvements = LIEN_PERENNE.format(id=RESSOURCES["cog_2026_mouvements"])
    con.sql(f"CREATE TABLE cog AS SELECT * FROM read_csv('{communes}', all_varchar = true)")
    con.sql(f"CREATE TABLE mvt AS SELECT * FROM read_csv('{mouvements}', all_varchar = true)")
    actuelles = {r[0] for r in con.sql("SELECT COM FROM cog WHERE TYPECOM = 'COM'").fetchall()}
    parents = dict(con.sql("SELECT COM, COMPARENT FROM cog WHERE TYPECOM IN ('COMD', 'COMA')").fetchall())
    # Pour chaque ancien code, l'événement le plus récent qui le fait devenir (ou rejoindre) une commune.
    suivants = dict(con.sql("""
        SELECT COM_AV, arg_max(COM_AP, DATE_EFF) FROM mvt
        WHERE TYPECOM_AP = 'COM' AND COM_AP <> COM_AV GROUP BY COM_AV""").fetchall())

    lignes = []
    for ancien in sorted((set(parents) | set(suivants)) - actuelles):
        code, source = ancien, None
        for _ in range(20):  # une chaîne d'événements reste courte ; la borne évite toute boucle
            if code in actuelles:
                break
            if code in parents:
                code, source = parents[code], source or "commune déléguée ou associée"
            elif code in suivants:
                code, source = suivants[code], source or "événement"
            else:
                break
        if code in actuelles:
            lignes.append((ancien, code, source))
    connus = {ligne[0] for ligne in lignes}
    lignes += [(ancien, actuel, f"correction : {motif}") for ancien, (actuel, motif) in CORRECTIONS.items()
               if ancien not in connus]

    PASSAGE_COMMUNES.parent.mkdir(parents=True, exist_ok=True)
    con.sql("CREATE TABLE passage (ancien VARCHAR, actuel VARCHAR, source VARCHAR)")
    con.executemany("INSERT INTO passage VALUES (?, ?, ?)", lignes)
    con.sql(f"COPY (SELECT * FROM passage ORDER BY ancien) TO '{PASSAGE_COMMUNES.as_posix()}' (HEADER, DELIMITER ',')")
    return dict(con.sql("SELECT split_part(source, ' :', 1), count(*) FROM passage GROUP BY 1").fetchall())


def main() -> None:
    comptes = construire()
    print(f"{sum(comptes.values()):,} anciens codes → {PASSAGE_COMMUNES} ({comptes})")


if __name__ == "__main__":
    main()
