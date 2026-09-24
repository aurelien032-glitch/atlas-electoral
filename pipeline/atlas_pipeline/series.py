"""Séries chronologiques : voix de chaque bloc et participation, par territoire et par tour.

Elles se calculent sur les fichiers déjà publiés (aucune nouvelle source) et se reconstruisent à la
fin de chaque construction :

  series/territoires.parquet       France, départements et circonscriptions des législatives
  series/communes/<dép>.parquet    communes au COG 2026, un fichier par département, chargé à la demande
  series/series.json               manifeste : tours couverts, lignes, empreintes SHA-256

Une ligne par territoire et par tour, et des comptes seulement : inscrits, votants, exprimés,
exprimés des communes votant par listes (base des parts des blocs, qui écarte le panachage des
municipales) et voix de chaque bloc (vides quand le bloc n'avait pas de candidat). Les parts se
calculent à l'affichage.

    python -m atlas_pipeline.series
"""
import argparse
import json
import time
from pathlib import Path

import duckdb

from .config import PUBLICATION, SCRUTINS
from .construire import chemin_sql, departement_de, ecrire, empreinte

BLOCS = ("EXG", "GAU", "CENT", "DTE", "EXD", "DIV", "NC")
COMPTES = "inscrits, votants, exprimes, exprimes_listes, " + ", ".join(BLOCS)


def construire(sortie: Path = PUBLICATION) -> dict:
    debut = time.time()
    tours = [s.id for s in SCRUTINS if (sortie / s.id / "agregats.parquet").exists()]
    con = duckdb.connect()

    participation = " UNION ALL ".join(f"""
        SELECT '{t}' AS scrutin, niveau, code, inscrits, votants, exprimes, exprimes_listes
        FROM {chemin_sql(sortie / t / 'agregats.parquet')}""" for t in tours)
    voix = " UNION ALL ".join(f"""
        SELECT '{t}' AS scrutin, v.niveau, v.code, c.bloc, v.voix
        FROM {chemin_sql(sortie / t / 'agregats_voix.parquet')} v
        JOIN {chemin_sql(sortie / t / 'candidats.parquet')} c USING (cand)""" for t in tours)
    con.sql(f"CREATE TEMP TABLE voix AS {voix}")
    inconnus = con.sql(f"SELECT DISTINCT bloc FROM voix WHERE bloc NOT IN {BLOCS}").fetchall()
    if inconnus:
        raise SystemExit(f"blocs inconnus dans les candidatures publiées : {inconnus}")

    # Voix d'un bloc vides (et non nulles) quand aucune de ses candidatures n'était sur les bulletins :
    # « pas de candidat » ne se confond pas avec « 0 % ». Un territoire sans voix publiées (commune au
    # panachage) garde sa participation, sans exprimés des communes à listes : aucune part n'y est calculée.
    par_bloc = ", ".join(f"sum(voix) FILTER (WHERE bloc = '{b}')::INTEGER AS {b}" for b in BLOCS)
    con.sql(f"""
        CREATE TEMP TABLE series AS
        SELECT p.niveau, p.code, p.scrutin, p.inscrits, p.votants, p.exprimes, p.exprimes_listes,
               {", ".join(f"v.{b}" for b in BLOCS)}
        FROM ({participation}) p
        LEFT JOIN (SELECT scrutin, niveau, code, {par_bloc} FROM voix GROUP BY ALL) v
          USING (scrutin, niveau, code)""")
    ecarts = con.sql(f"""
        SELECT count(*) FROM (SELECT scrutin, niveau, code, sum(voix) AS s FROM voix GROUP BY ALL) v
        JOIN series USING (scrutin, niveau, code)
        WHERE v.s <> {" + ".join(f"coalesce({b}, 0)" for b in BLOCS)}""").fetchone()[0]
    if ecarts:
        raise SystemExit(f"{ecarts} territoire(s) dont les voix par bloc ne redonnent pas le total")

    dossier = sortie / "series"
    (dossier / "communes").mkdir(parents=True, exist_ok=True)
    for ancien in (dossier / "communes").glob("*.parquet"):
        ancien.unlink()
    ecrire(con, f"""SELECT niveau, code, scrutin, {COMPTES} FROM series WHERE niveau <> 'commune'
                    ORDER BY niveau, code, scrutin""", dossier / "territoires.parquet")
    departements = [d for (d,) in con.sql(f"""
        SELECT DISTINCT {departement_de('code')} FROM series WHERE niveau = 'commune' ORDER BY 1""").fetchall()]
    for dep in departements:
        ecrire(con, f"""SELECT code, scrutin, {COMPTES} FROM series
                        WHERE niveau = 'commune' AND {departement_de('code')} = '{dep}'
                        ORDER BY code, scrutin""", dossier / "communes" / f"{dep}.parquet")

    fichiers = sorted(dossier.glob("*.parquet")) + sorted(dossier.glob("communes/*.parquet"))
    manifeste = {
        "tours": tours,
        "lignes": dict(con.sql("SELECT niveau, count(*) FROM series GROUP BY 1 ORDER BY 1").fetchall()),
        "fichiers": {f.relative_to(dossier).as_posix(): {"octets": f.stat().st_size, "sha256": empreinte(f)}
                     for f in fichiers},
        "duree_s": round(time.time() - debut, 1),
    }
    (dossier / "series.json").write_text(json.dumps(manifeste, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifeste


def resume(m: dict) -> str:
    communes = [f for nom, f in m["fichiers"].items() if nom.startswith("communes/")]
    territoires = m["fichiers"]["territoires.parquet"]["octets"]
    return (f"séries : {len(m['tours'])} tours, {sum(m['lignes'].values()):,} lignes, "
            f"territoires {territoires / 1e3:.0f} Ko, communes {sum(f['octets'] for f in communes) / 1e6:.1f} Mo "
            f"en {len(communes)} fichiers (le plus gros : {max(f['octets'] for f in communes) / 1e3:.0f} Ko), "
            f"{m['duree_s']} s")


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sortie", type=Path, default=PUBLICATION)
    args = parser.parse_args(argv)
    print(resume(construire(args.sortie)))


if __name__ == "__main__":
    main()
