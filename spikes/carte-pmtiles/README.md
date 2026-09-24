# Prototype : carte des bureaux de vote

Valide l'architecture de l'ADR-001 (voir `docs/PLAN.md`, § 7.5) : les tuiles officielles des bureaux de vote
(data.gouv.fr) et les tuiles administratives de l'IGN sont lues directement par MapLibre, et les résultats
d'un scrutin (1,6 Mo de Parquet) sont appliqués par `setFeatureState`.

## Lancer

```bash
pip install duckdb
python build_data.py 2022_pres_t1
python -m http.server 8765
```

Puis ouvrir <http://localhost:8765>. `build_data.py` lit les Parquet officiels à distance : rien n'est
téléchargé en entier, et les fichiers produits vont dans `data/` (ignoré par git).

## Limites connues

- Un seul scrutin, à candidats nationaux (présidentielle, européennes).
- Mode « Tête » uniquement : trois paliers d'intensité selon l'avance (serré, net, large) et une catégorie « égalité ».
- Les bureaux sont affichés à tous les zooms ; la v1 montrera les communes et les départements en vue nationale.
