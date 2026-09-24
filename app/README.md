# Application

Site statique de l'Atlas électoral : React 19, TypeScript, Vite, MapLibre GL JS 6 (tuiles PMTiles officielles
des bureaux de vote, contours simplifiés d'Etalab), hyparquet pour lire les fichiers publiés par le pipeline.
Direction visuelle « A · Éditorial » : Newsreader et Source Sans 3, auto-hébergées (`@fontsource-variable`).

```bash
npm install
npm run dev      # sert aussi ../publication sous /data (lancer d'abord le pipeline)
npm test         # tests unitaires (Vitest)
npm run build    # vérification TypeScript puis build de production
```

Organisation :

| Dossier ou fichier | Rôle |
|---|---|
| `src/donnees/` | Types, lecture des Parquet (hyparquet), requêtes TanStack Query, index des territoires, noms |
| `src/calculs/` | Parts, écarts entre scrutins, seuils de classes lisibles, séries chronologiques (fonctions pures, testées) |
| `src/modes.ts` | Valeurs et coloriage de chaque mode de carte : Tête, Score, Participation, Évolution |
| `src/cibles.ts` | Ce que montre le mode Score : une candidature ou un bloc |
| `src/carte/` | Carte MapLibre, palettes validées, feature-states, légende, onglets, infobulle |
| `src/panneau/` | Aperçu de chaque mode, détail d'un territoire (fil d'Ariane, résultats en tableau), « Au fil des scrutins » (courbes SVG et tableau) |
| `src/recherche/` | Recherche d'une commune ou d'un département (normalisation des noms, classement, combobox) |
| `src/vue.ts`, `src/url.ts` | État de la vue dans l'URL (`?scrutin=…&mode=…&cible=…&bloc=…&de=…&sel=…`) |
