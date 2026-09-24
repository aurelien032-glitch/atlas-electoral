# Atlas électoral — guide pour Claude

Dataviz publique et open source (AGPL-3.0) des résultats électoraux français, jusqu'au bureau de vote.
Les décisions et leurs raisons sont dans [docs/PLAN.md](docs/PLAN.md) : il fait foi. Tout nouveau choix
structurant y est consigné (section concernée et tableau des questions ouvertes).

## Structure

| Dossier | Rôle |
|---|---|
| `pipeline/` | Python + DuckDB : lit les sources officielles **à distance** et produit `publication/v1/` |
| `referentiels/` | Fichiers versionnés : grille des nuances, attributions, totaux officiels, liste des contours |
| `app/` | Site statique : React 19, TypeScript, Vite 8, MapLibre GL JS 6, hyparquet, TanStack Query |
| `spikes/` | Prototypes jetables (ne pas faire évoluer : reprendre le code dans `app/`) |
| `publication/` | Fichiers générés par le pipeline, ignorés par git |

Le prototype v0 (FastAPI + DuckDB) est conservé sous le tag `prototype-v0` : ne pas le restaurer.

## Commandes

```bash
cd pipeline && python -m atlas_pipeline.construire && python -m pytest   # données + 58 tests
cd pipeline && python -m atlas_pipeline.geo                              # contours simplifiés Etalab
cd app && npm run dev        # sert aussi ../publication sous /data
cd app && npx tsc -b && npm run lint && npm test && npm run build          # avant tout commit
```

## Règles de données

- **Aucune donnée brute sur le disque** : DuckDB lit les Parquet de data.gouv par requêtes Range. Ne jamais
  réintroduire de copie locale des sources ni de base DuckDB persistante.
- **Aucun SQL à l'exécution** : le site ne lit que des fichiers précalculés.
- On ne publie que des **comptes** (voix, inscrits…) ; les pourcentages se calculent à l'affichage.
- La **candidature en tête** et son **avance** sont précalculées par bureau et par commune (`bureaux.parquet`,
  `agregats.parquet`) : la carte ne décode pas les voix au chargement.
- Contrôles **bloquants** (le build échoue) : conservation des lignes, votants = blancs + nuls + exprimés,
  unicité des clés, toute nuance présente dans le référentiel. Anomalies **tolérées et tracées** dans le
  manifeste : somme des voix ≠ exprimés, votants > inscrits.
- Les codes de département se déduisent du code commune INSEE (le champ source mélange `ZA` et `971`).
- Les législatives n'ont plus de code de circonscription depuis 2024 : une candidature y est identifiée par
  département, panneau et nom.

## Classement politique (sensible)

- Trois couches : **nuance officielle** (jamais modifiée, toujours affichée) → **famille** (grille du projet)
  → **bloc** (grille de la circulaire du ministère de février 2026, appliquée à tous les scrutins).
- Toute modification de `referentiels/nuances.csv` ou `candidats_nuances.csv` est une décision éditoriale :
  la proposer à l'utilisateur, ne jamais la trancher seul. Signaler les cas limites (`cas_limite = oui`).
- L'outil montre et cite ses sources ; il ne commente pas.

## Carte

- Géométrie des bureaux : PMTiles officiel de data.gouv (2022), `promoteId: 'codeBureauVote'`, résultats
  appliqués par `setFeatureState` (jamais de grosse expression `match` : le prototype v0 plafonnait à 500).
- Vue nationale (zoom < 9) : communes simplifiées d'Etalab (COG 2026). Les tuiles vectorielles ADMIN EXPRESS de
  l'IGN sont trop lourdes (11,4 Mo par tuile au zoom 5) : ne pas les utiliser pour l'affichage.
- Scrutins dont moins de 98 % des inscrits de métropole joignent les contours (`niveau_carte = commune`) :
  chaque bureau prend la couleur de sa commune.
- MapLibre 6 est en ESM seul : garder `optimizeDeps.exclude: ['maplibre-gl']`, `worker.format: 'es'` et
  `setWorkerUrl(urlWorker)` (import `?worker&url`), sinon le worker ne se charge pas.
- Appliquer les résultats dès `style.load`, pas `load` (qui attend un rendu complet, bloqué en arrière-plan).

## Couleurs et accessibilité

- Toute palette passe le validateur du skill `dataviz` (`node scripts/validate_palette.js "<hex,…>" --pairs all`)
  **à chaque niveau d'opacité utilisé** : avec cinq blocs, le plancher d'intensité est 0,8.
- Couleur toujours doublée (légende, panneau de détail, vue tableau à venir). Charte sobre et neutre, sans
  codes visuels de l'État (DSFR, Marianne).

## Style de code

- Noms de variables, de fonctions et commentaires **en français** ; commentaires rares, qui expliquent le pourquoi.
- TypeScript strict (`verbatimModuleSyntax` : `import type`), pas de `any`.
- Commits en français ; pas de push sans accord explicite de l'utilisateur.
