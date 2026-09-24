# Application

Site statique de l'Atlas électoral : React 19, TypeScript, Vite, MapLibre GL JS 6 (tuiles PMTiles officielles
des bureaux de vote et tuiles IGN), hyparquet pour lire les fichiers publiés par le pipeline.

```bash
npm install
npm run dev      # sert aussi ../publication sous /data (lancer d'abord le pipeline)
npm test         # tests unitaires (Vitest)
npm run build    # vérification TypeScript puis build de production
```

Organisation :

| Dossier | Rôle |
|---|---|
| `src/donnees/` | Types, lecture des Parquet (hyparquet), requêtes TanStack Query |
| `src/carte/` | Carte MapLibre, couleurs validées, calcul des feature-states |
| `src/panneau/` | Légende et détail du territoire survolé |
| `src/url.ts` | État de la vue dans l'URL (`?scrutin=…`) |
