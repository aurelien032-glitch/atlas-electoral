# Atlas électoral

Visualisation interactive et publique des résultats des élections françaises (présidentielles, législatives,
européennes, municipales…), de la France entière jusqu'au **bureau de vote**, à partir des données officielles.

> **En construction.** La conception, les choix et leurs raisons sont décrits dans le
> [plan de conception](docs/PLAN.md).

## Organisation

| Dossier | Contenu |
|---|---|
| [`pipeline/`](pipeline/README.md) | Python + DuckDB : lit les résultats officiels de data.gouv.fr à distance et publie des fichiers compacts (16 Mo pour 7 tours de scrutin), contrôlés par 58 tests |
| [`referentiels/`](referentiels/README.md) | Grille des nuances politiques, attributions, totaux officiels, liste des bureaux des contours |
| [`app/`](app/README.md) | Site statique : React, TypeScript, Vite, MapLibre GL JS |
| [`docs/`](docs/PLAN.md) | Plan de conception et décisions |
| [`spikes/`](spikes/carte-pmtiles/README.md) | Prototypes exploratoires |

## Démarrer

```bash
cd pipeline && pip install -r requirements.txt
python -m atlas_pipeline.construire   # résultats des scrutins → ../publication/v1
python -m atlas_pipeline.geo          # contours simplifiés (Etalab) → ../publication/v1/geo
cd ../app && npm install && npm run dev
```

## Sources

- Résultats : ministère de l'Intérieur, jeu « Données des élections agrégées » sur data.gouv.fr
- Contours des bureaux de vote : « Proposition de contours des bureaux de vote », data.gouv.fr (2022, indicatifs) ;
  découpages locaux : Bordeaux Métropole, Ville de Paris (Paris Centre, ODbL), contours « selon la méthode de l'Insee »
  de Cédric Rossi (Alès et cinq communes aux contours de 2022 erronés)
- Contours administratifs : IGN (ADMIN EXPRESS), versions simplifiées publiées par Etalab
- Blocs politiques : circulaire du ministère de l'Intérieur de février 2026 (INTP2602966C)

## Licence

[GNU AGPL v3.0](LICENSE) — toute version modifiée mise à disposition en ligne doit publier son code source.

Les données électorales proviennent de sources publiques sous [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
Seul fichier publié sous une autre licence : `geo/correctifs_bureaux_odbl.geojson`, tiré des « Secteurs des bureaux de
vote 2024 » de la Ville de Paris, sous [ODbL](https://opendatacommons.org/licenses/odbl/1-0/), comme sa source.
