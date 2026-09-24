# Pipeline de données

Transforme les sources officielles (data.gouv.fr) en fichiers compacts publiés par le site. Aucune donnée brute
n'est stockée : DuckDB lit les Parquet officiels à distance, par morceaux.

```bash
cd pipeline
pip install -r requirements.txt
python -m atlas_pipeline.contours      # une fois : liste des bureaux des contours officiels (referentiels/)
python -m atlas_pipeline.construire    # les 7 tours de la v1 → ../publication/v1/
python -m pytest                       # contrôles sur les fichiers publiés
```

Sorties par scrutin (`publication/v1/<scrutin>/`) : `bureaux.parquet` (vue par défaut de la carte),
`voix.parquet`, `candidats.parquet`, `agregats.parquet`, `agregats_voix.parquet` et `scrutin.json`
(compteurs, totaux, taux de jointure aux contours, empreintes SHA-256). Le catalogue `scrutins.json` et le
manifeste `sources.lock.json` (URL, ETag et date des sources) sont à la racine de `publication/v1/`.

Les règles de classement politique sont dans `../referentiels/` (voir son README).
