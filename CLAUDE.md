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
cd pipeline && python -m atlas_pipeline.construire && python -m pytest   # données, séries + 636 tests
cd pipeline && python -m atlas_pipeline.series                           # séries seules (≈ 15 s)
cd pipeline && python -m atlas_pipeline.geo                              # contours Etalab + index des territoires
cd pipeline && python -m atlas_pipeline.cog                              # passage des communes vers le COG 2026
cd pipeline && python -m atlas_pipeline.circonscriptions --source <GeoJSON des bureaux>  # contours (≈ 4 min)
cd pipeline && python -m atlas_pipeline.encarts                          # encarts petite couronne et outre-mer
cd app && npm run dev        # sert aussi ../publication sous /data
cd app && npx tsc -b && npm run lint && npm test && npm run build          # avant tout commit
cd app && npm run preview    # build de production avec les en-têtes de public/_headers (CSP)
```

Mise en ligne : [docs/mise-en-ligne.md](docs/mise-en-ligne.md). Workflows `Vérifications` (chaque envoi) et
`Publier` (à la main : reconstruit tout depuis les sources, contrôle, déploie sur Cloudflare Pages). Tout
nouveau service appelé par le navigateur doit être ajouté à la CSP de `app/public/_headers`.

## Règles de données

- **Aucune donnée brute sur le disque** : DuckDB lit les Parquet de data.gouv par requêtes Range. Ne jamais
  réintroduire de copie locale des sources ni de base DuckDB persistante.
- **Aucun SQL à l'exécution** : le site ne lit que des fichiers précalculés, tous en Parquet ZSTD (seul
  décompresseur embarqué : `fzstd`).
- On ne publie que des **comptes** (voix, inscrits…) ; les pourcentages se calculent à l'affichage.
- La **candidature en tête** et son **avance** sont précalculées par bureau et par commune (`bureaux.parquet`,
  `agregats.parquet`) : la carte ne décode pas les voix au chargement.
- Contrôles **bloquants** (le build échoue) : conservation des lignes, votants = blancs + nuls + exprimés,
  unicité des clés, toute nuance présente dans le référentiel. Anomalies **tolérées et tracées** dans le
  manifeste : somme des voix ≠ exprimés, votants > inscrits.
- Les codes de département se déduisent du code commune INSEE (le champ source mélange `ZA` et `971`).
- Les législatives n'ont plus de code de circonscription depuis 2024 : on le reprend des fichiers officiels
  « résultats par circonscription » (département, panneau, nom, prénom). Une candidature y est identifiée par
  sa circonscription (« 69-02 ») ; un bureau n'a qu'une circonscription (contrôle bloquant) ; les totaux par
  circonscription doivent égaler les totaux officiels.
- 56 tours (1999-2026), dans `config.SCRUTINS`. Avant 2022, carte à la commune (`carte_au_bureau`). Jusqu'en
  2015, blancs et nuls sont comptés ensemble (colonne `blancs` vide) : ne jamais inventer de répartition.
- Municipales 2014 et 2020 : les communes au panachage (vote pour des personnes) sont publiées à part
  (`panachage/<dép>.parquet`, chargé à la demande) ; les parts des blocs se calculent sur `exprimes_listes`.
- Séries (`series/`, « Au fil des scrutins ») : relues dans les fichiers publiés à la fin de chaque
  construction. Voix d'un bloc **vides** quand il n'avait pas de candidat : ne jamais les remplacer par 0.
- Paris, Lyon et Marseille : niveau « arrondissement » des agrégats, tiré du numéro de bureau (« 75056_1512 »
  → 75115, `construire.ARRONDISSEMENT`, `arrondissementDu` côté client). Sur la carte, les arrondissements
  sont dessinés par-dessus leur ville dans la couche des communes.
- Les agrégats par commune sont au **COG 2026** (`referentiels/passage_communes_2026.csv`) ; les bureaux gardent
  le code de commune de l'année du vote (le client passe par `communeDu(code, passage)`).

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
- La carte (et la feuille de style de MapLibre) est chargée en différé (`React.lazy`) : le panneau s'affiche
  d'abord. Ses styles arrivant après les nôtres, nos réglages des classes `maplibregl-*` passent par
  `.zone-carte` pour l'emporter.
- Ne jamais passer à la carte un tableau ou un objet recréé à chaque rendu (`?? []`) : son effet de coloriage
  se relancerait à chaque mise à jour (plusieurs secondes sur un téléphone). Les états ne sont posés que
  s'ils changent ; ceux des bureaux, à l'approche du zoom des bureaux.
- Les Parquet sont téléchargés sur la page (préchargements de `index.html`) puis décodés dans un worker
  (`donnees/decodeur.worker.ts`) : décoder l'index des territoires ou 70 000 bureaux bloquerait la page.
- Appliquer les résultats dès `style.load`, pas `load` (qui attend un rendu complet, bloqué en arrière-plan).
- Le feature-state porte `couleur`, `opacite`, `hachure` et `selection`. Sans état, un territoire n'est pas
  peint (« sans résultat ») ; les hachures marquent une valeur sans objet (pas de candidat du bloc, pas
  comparable). `removeFeatureState` efface aussi la sélection : la remettre après chaque coloriage.
- Le mode Évolution se lit à la commune : les numéros de bureaux changent d'un scrutin à l'autre.
- Encarts de la vue nationale (petite couronne, départements d'outre-mer) : chemins SVG précalculés
  (`geo/encarts.json`), colorés avec les mêmes états que la carte. Les contours des circonscriptions d'outre-mer
  portent le code INSEE des résultats (« 971-01 »), pas celui du ministère (« ZA-01 ») : un test le vérifie.
- Commune sélectionnée : contour détaillé demandé à `geo.api.gouv.fr` (API officielle, CORS ouvert), contour
  simplifié en secours. Dans le panneau intégré, MapLibre attend une image (`requestAnimationFrame`) pour
  charger son style : une capture d'écran la déclenche, ce n'est pas un bug du site.

## Couleurs et accessibilité

- Toute palette passe le validateur du skill `dataviz` (`node scripts/validate_palette.js "<hex,…>" --pairs all`)
  **à chaque niveau d'opacité utilisé** : avec cinq blocs, le plancher d'intensité est 0,8. Les dégradés
  (Score dans la teinte du bloc, Participation en sarcelle, bras de l'Évolution) passent `--ordinal`, sur le
  fond papier `#F6F4EF`. Palettes dans `app/src/carte/couleurs.ts`.
- Couleur toujours doublée (légende, panneau de détail, vue tableau à venir). Charte sobre et neutre, sans
  codes visuels de l'État (DSFR, Marianne).
- Direction visuelle « A · Éditorial » : Newsreader (titres) et Source Sans 3 (texte), **auto-hébergées** par
  `@fontsource-variable` (pas de Google Fonts : aucune requête vers un tiers).

## Style de code

- Noms de variables, de fonctions et commentaires **en français** ; commentaires rares, qui expliquent le pourquoi.
- TypeScript strict (`verbatimModuleSyntax` : `import type`), pas de `any`.
- Commits en français ; pas de push sans accord explicite de l'utilisateur.
