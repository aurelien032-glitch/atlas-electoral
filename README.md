# Transparence Publique — Élections

Visualisation interactive et publique des résultats de scrutins électoraux français
(présidentielles, législatives, européennes, municipales…) jusqu'au niveau du **bureau de vote**.

## Stack

| Couche | Technologies |
|---|---|
| API | Python · FastAPI · DuckDB · tuiles vectorielles (mercantile, shapely) |
| Web | React 19 · TypeScript · Vite · MapLibre GL · deck.gl · ECharts |
| Déploiement | Docker Compose (API :8000, Web :8080 via nginx) |

## Structure

```
api/        API FastAPI, endpoints élections / géo / recherche / tuiles, ETL (api/etl)
web/        Front-end React (cartes choroplèthes, graphiques de résultats)
Data/       Données sources — NON versionnées (voir ci-dessous)
```

## Données

Les données ne sont pas incluses dans le dépôt (plusieurs Go). Sources open data :

- Résultats électoraux : [data.gouv.fr — Ministère de l'Intérieur](https://www.data.gouv.fr/fr/pages/donnees-des-elections/)
- Répertoire électoral unique (bureaux de vote) : INSEE
- Fonds de carte : IGN / data.gouv.fr

Placer les fichiers dans `Data/Election/` et `Data/Map/`, puis construire la base :

```bash
cd api
python etl/processor.py
python etl/precalc_geometries.py
python etl/add_indexes.py
```

## Lancer le projet

```bash
docker compose up --build
```

- Web : http://localhost:8080
- API : http://localhost:8000 (docs : http://localhost:8000/docs)

En développement :

```bash
cd api && pip install -r requirements.txt && uvicorn main:app --reload
cd web && npm ci && npm run dev
```

## Licence

À définir.
