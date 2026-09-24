# Pipeline de données

Transforme les sources officielles (data.gouv.fr) en fichiers compacts publiés par le site. Aucune donnée brute
n'est stockée : DuckDB lit les Parquet officiels à distance, par morceaux.

```bash
cd pipeline
pip install -r requirements.txt
python -m atlas_pipeline.contours      # une fois : liste des bureaux des contours officiels (referentiels/)
python -m atlas_pipeline.cog           # une fois par millésime : passage des communes vers le COG 2026
python -m atlas_pipeline.geo           # contours simplifiés d'Etalab, index des territoires
python -m atlas_pipeline.construire    # les 56 tours (1999-2026) puis les séries → ../publication/v1/
python -m atlas_pipeline.series        # les séries seules, relues dans les fichiers publiés (≈ 15 s)
python -m pytest                       # contrôles sur les fichiers publiés
```

Sorties par scrutin (`publication/v1/<scrutin>/`) : `bureaux.parquet` (vue par défaut de la carte),
`voix.parquet`, `candidats.parquet`, `agregats.parquet` (communes au COG 2026, circonscriptions aux législatives,
départements, France), `agregats_voix.parquet`, `circonscriptions.parquet` (législatives),
`panachage/<dép>.parquet` (municipales 2014 et 2020 : candidats des petites communes, à part) et `scrutin.json`
(compteurs, totaux, taux de jointure aux contours, empreintes SHA-256). Le catalogue `scrutins.json` et le
manifeste `sources.lock.json` (URL, ETag et date des sources) sont à la racine de `publication/v1/`.

Séries (`publication/v1/series/`) : comptes de chaque territoire à chaque tour (inscrits, votants, exprimés,
voix par bloc, vides quand le bloc n'avait pas de candidat), pour « Au fil des scrutins » : `territoires.parquet`
(France, départements, circonscriptions) et `communes/<dép>.parquet`.

Les règles de classement politique sont dans `../referentiels/` (voir son README).
