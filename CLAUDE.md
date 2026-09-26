# Atlas électoral — guide pour Claude

Dataviz publique et open source (AGPL-3.0) des résultats électoraux français, jusqu'au bureau de vote.
Les décisions et leurs raisons sont dans [docs/PLAN.md](docs/PLAN.md) : il fait foi. Tout nouveau choix
structurant y est consigné (section concernée et tableau des questions ouvertes). Le parcours (vues, commandes,
règles de cohérence) est dans [docs/parcours-utilisateur.md](docs/parcours-utilisateur.md) : le mettre à jour à
chaque nouvel écran, lien ou sélecteur. Les réglages (scrutin, cible, bloc, départ) vivent dans
`panneau/Reglages.tsx`, au même endroit dans l'aperçu et dans la fiche ; aucun ne fait quitter le territoire choisi.

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
cd pipeline && python -m atlas_pipeline.construire && python -m pytest   # données, séries + 641 tests
cd pipeline && python -m atlas_pipeline.series                           # séries seules (≈ 15 s)
cd pipeline && python -m atlas_pipeline.geo                              # contours Etalab + index des territoires
cd pipeline && python -m atlas_pipeline.cog                              # passage des communes vers le COG 2026
cd pipeline && python -m atlas_pipeline.circonscriptions --source <GeoJSON des bureaux>  # contours (≈ 4 min)
cd pipeline && python -m atlas_pipeline.encarts                          # encarts petite couronne et outre-mer
cd pipeline && python -m atlas_pipeline.correctifs                       # contours locaux, communes sans contour (≈ 30 s)
cd app && npm run dev        # sert aussi ../publication sous /data
cd app && npx tsc -b && npm run lint && npm test && npm run build          # avant tout commit
cd app && npm run preview    # build de production avec les en-têtes de public/_headers (CSP)
```

En local, faute de DuckDB sous Python 3.12, `construire`, `correctifs` et les tests tournent sous Python 3.9
(`from __future__ import annotations` dans `config.py` et `correctifs.py`), sauf `tests/test_fonctions.py` (`encarts.py`).

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
- Couverture de la source (catalogue, calculée à chaque construction) : territoires absents, départements
  incomplets (moins de 80 % des inscrits du scrutin complet le plus proche), bureaux aux inscrits aberrants
  (plus de 4 000 et plus de dix fois les votants). **Signalés, jamais corrigés** (Q17) ; nos totaux se rapprochent
  des totaux officiels (`referentiels/totaux_officiels.csv`, test de réconciliation).
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
- `plusieurs_elections` (agrégats, communes et arrondissements) : aucun bureau n'a toutes les candidatures du
  territoire, qui réunit donc plusieurs élections (circonscriptions, cantons, secteurs, communes fusionnées
  depuis). Pas de phrase « en tête » ni de comparaison ; carte, infobulle et décompte national prennent le bloc
  qui totalise le plus de voix (`bloc_en_tete`, `avance_bloc_x10000`, décision Q16).
- Paris, Lyon et Marseille : niveau « arrondissement » des agrégats, tiré du numéro de bureau (« 75056_1512 »
  → 75115, `construire.ARRONDISSEMENT`, `arrondissementDu` côté client). Sur la carte, les arrondissements
  sont dessinés par-dessus leur ville dans la couche des communes ; la ville n'est alors pas peinte (un
  arrondissement sans résultat reste vide), et un bureau prend la couleur de son arrondissement, jamais de la ville.
  Municipales par secteur (2008-2020) : un arrondissement de Marseille, ou de Paris Centre en 2020, se compare à son
  secteur entier (`secteurDe` de `territoires.ts`, colonne « 1er secteur », « Paris Centre »).
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
- Vue nationale (zoom < 9) : communes simplifiées d'Etalab (COG 2026) ; départements à 1 000 m, remplacés par le
  tracé à 100 m (`departements-detail.geojson`) à l'approche du zoom des bureaux. Contours publiés sans les noms
  (ils sont dans l'index des territoires). Les tuiles vectorielles ADMIN EXPRESS de l'IGN sont trop lourdes
  (11,4 Mo par tuile au zoom 5) : ne pas les utiliser pour l'affichage.
- Fond de plan au zoom des bureaux (≥ 9) : Plan IGN en images (Géoplateforme, WMTS, sans clé), rendu en gris par
  MapLibre (`raster-saturation`) ; les bureaux y sont à 70 % d'opacité par défaut (`OPACITE_SUR_PLAN`, les blocs
  restent distincts, ≥ 13,5), réglable de 10 à 100 % par le bouton sous le zoom (`carte/Opacite.tsx`, actif au zoom
  des bureaux, gardé par le navigateur : `carte/preferences.ts`, jamais dans l'URL). Pas de Positron : CARTO exige
  désormais une clé. Hôte `data.geopf.fr` dans la CSP (tuiles et géocodeur).
- Recherche d'adresse : géocodeur de la Géoplateforme (`recherche/adresses.ts`), interrogé après une pause de
  frappe et seulement pour un texte qui ressemble à une adresse. Le bureau est celui que `queryRenderedFeatures`
  trouve sous l'adresse une fois la carte arrivée (`idle`) ; la commune (ou l'arrondissement) quand la carte du
  scrutin s'arrête à la commune. Jamais `padding` dans `flyTo` ou `easeTo` : MapLibre en fait la marge permanente de
  la carte, qui s'ajoute à celle des `fitBounds` suivants (ils ne tiennent plus et échouent sans erreur) ; `offset`
  à la place.
- Scrutins dont moins de 98 % des inscrits de métropole joignent les contours (`niveau_carte = commune`) :
  chaque bureau prend la couleur de sa commune. La jointure (`construire`) compte les contours locaux avec la règle
  de la carte (Q29) : les municipales 2026 passent ainsi au bureau (98,3 % et 98,1 %).
- Bureaux sans contour (décision Q25, `carte/repli.ts`, testé) : les contours de 2022 manquent pour quelques villes
  (Troyes, Alès, Belfort, Dieppe, Aurillac…) et ne suivent pas les bureaux créés ou renumérotés depuis (Bordeaux et
  Paris Centre en 2024). Au zoom des bureaux, une commune sans aucun contour est dessinée par son contour détaillé
  (couche `communes-repli`, source `communes-sans-contour` : `geo/communes_sans_contour.geojson`, API Découpage
  administratif ; contour simplifié pour les collectivités d'outre-mer). Sur une carte au bureau, un contour sans résultat prend la couleur de sa
  commune (de son arrondissement à Paris, Lyon et Marseille), et tout le territoire quand plus de la moitié de ses
  inscrits votent dans un bureau sans contour ; ces contours perdent leur tracé (`commune` dans le feature-state) et
  désignent la commune au survol, au clic et pour une adresse. Note dans la légende et dans la fiche. Il n'existe
  pas de contours nationaux plus récents (Etalab ne mettra pas les siens à jour ; table de l'Insee quinquennale).
- Contours locaux (`atlas_pipeline.correctifs`, décisions Q27 à Q29) : tous les découpages de bureaux publiés en open
  data et trouvés le 26/09 (Bordeaux Métropole, Ville de Paris 2026, Toulouse Métropole 2024, Nantes, Strasbourg,
  Lyon, La Tour-de-Salvagny, Caen 2026, Saint-Nazaire, Pornichet, Orléans, La Rochelle, Brest 2026 ; contours
  « méthode de l'Insee » de Cédric Rossi), dans `geo/correctifs_bureaux.geojson` (Licence Ouverte) ; Rennes Métropole (ODbL) dans
  `geo/correctifs_bureaux_odbl.geojson`, à part pour que le partage à l'identique ne s'étende pas au reste ;
  l'application réunit les deux. Numéros normalisés comme ceux des résultats (`numero` : « 0012 », « 601A »). Ne sont
  gardés que les territoires où la source porte des numéros absents des contours de 2022 ; un territoire relève d'une
  seule source (la première de `SOURCES`). Chaque source dit ses `territoires`, son année (`depuis` : pas avant, même si
  les numéros concordent) et comment la citer. Carte au bureau : un territoire dont au moins 90 % des bureaux du
  scrutin y figurent (`SEUIL_CORRECTIF`, aussi dans `config.py`) est dessiné par eux (source `correctifs`, par-dessus
  les contours de 2022, rendus transparents : `CACHE`) ; fiche et Méthodologie (liste lue dans les fichiers) citent
  la source, la carte dans son attribution. Une ville dont un polygone n'a pas de numéro n'est pas reprise (Troyes,
  Belfort, Dieppe, Aurillac) : pas de numéro inventé. Tracés simplifiés (Douglas-Peucker, 1 m ; 3 m pour les
  communes) : 380 Ko compressés, demandés à l'approche du zoom des bureaux (`onApprocheBureaux`), pas en vue nationale.
- Contours de 2022 faux (Q28) : Troyes, Alès, Belfort, Dieppe et Aurillac y sont rattachées, à tort, au dernier bureau
  de la commune au code INSEE précédent (Trouans, Aimargues, Beaucourt, Déville-lès-Rouen, Auriac-l'Église), qui
  déborde ainsi sur elles (les bureaux des communes voisines, découpés selon leur commune, n'y débordent pas : vérifié
  le 26/09). Ces cinq communes (`remplace`) sont dessinées à tout scrutin par la méthode de l'Insee, leurs contours de
  2022 effacés, même sur une carte à la commune (à la couleur de la commune).
- Couches des contours locaux filtrées sur les territoires qu'elles dessinent au scrutin (`bureauxParmi`) : invisibles,
  les autres répondraient au survol. Survol et clic : un seul écouteur, qui retient l'élément le plus haut sous le
  pointeur (`COUCHES_ACTIVES`), en passant les contours de 2022 effacés (`efface`) ; la sélection d'un bureau se trace
  sur la source qui le dessine (`cible`). Une commune sans contour dessinée par son découpage local (Alès) n'est pas
  peinte dessous (`locale` dans le feature-state de `communes-sans-contour`).
- MapLibre 6 est en ESM seul : garder `optimizeDeps.exclude: ['maplibre-gl']`, `worker.format: 'es'` et
  `setWorkerUrl(urlWorker)` (import `?worker&url`), sinon le worker ne se charge pas.
- La carte (et la feuille de style de MapLibre) est chargée en différé (`React.lazy`) : le panneau s'affiche
  d'abord. Ses styles arrivant après les nôtres, nos réglages des classes `maplibregl-*` passent par
  `.zone-carte` pour l'emporter. Elle est protégée par `GardeCarte` : si elle échoue, le panneau reste.
- Ordre des téléchargements (`App.tsx`) : les chiffres du panneau (catalogue, agrégats, candidats, petit index
  des départements) ; puis la carte ; puis, une fois les contours des communes chargés (`onPrete`), l'index
  complet des territoires, l'historique et les bureaux ; à l'approche du zoom des bureaux (zoom 7), les contours
  locaux et ceux des communes sans contour. Un lien vers un territoire, la recherche ou la fiche d'un bureau
  demandent tout de suite ce dont ils ont besoin.
- Ne jamais passer à la carte un tableau ou un objet recréé à chaque rendu (`?? []`) : son effet de coloriage
  se relancerait à chaque mise à jour (plusieurs secondes sur un téléphone). Les états ne sont posés que
  s'ils changent ; ceux des bureaux, pour les seuls départements à l'écran et autour (`departementsEnVue`), dès le
  début d'un zoom qui s'en approche puis au fil des déplacements, par lots d'une image à l'autre : MapLibre confronte
  chaque état posé à chaque tuile chargée (70 000 états figeaient un téléphone de 2 à 3 s, Q28).
- Recoloriage (décisions Q26, Q27) : toute couche qui lit l'état de ses territoires se recalcule, pour chacun, à
  chaque coloriage, même vide ou transparente. N'en ajouter qu'à bon escient : hachures masquées quand le coloriage
  n'en a pas, sélection des communes par leur contour détaillé. Changer le filtre ou la visibilité d'une couche
  recharge toute sa source : seulement quand c'est rare. Source des communes à marge de tuile réduite (`buffer: 32`)
  mais à la simplification par défaut (plus forte, elle fissure les frontières communes). Côté calcul : seuils par
  histogramme (`quantilesPonderes`, même résultat que le tri, testé), un état partagé par classe ou par bloc.
- Les Parquet sont téléchargés sur la page (préchargements de `index.html`) puis décodés dans un worker
  (`donnees/decodeur.worker.ts`) : décoder l'index des territoires ou 70 000 bureaux bloquerait la page.
- Appliquer les résultats dès `style.load`, pas `load` (qui attend un rendu complet, bloqué en arrière-plan).
- Le feature-state porte `couleur`, `opacite`, `hachure` et `selection`. Sans état, un territoire n'est pas
  peint (« sans résultat ») ; les hachures marquent une valeur sans objet (pas de candidat du bloc, pas
  comparable). `removeFeatureState` efface aussi la sélection : la remettre après chaque coloriage.
- Le mode Évolution se lit à la commune : les numéros de bureaux changent d'un scrutin à l'autre.
- Encarts de la vue nationale (petite couronne, départements et collectivités d'outre-mer) : chemins SVG
  précalculés (`geo/encarts.json`), colorés avec les mêmes états que la carte, affichés dans la vue d'ensemble
  seulement (au plus un niveau de zoom au-delà de la métropole entière, signalé par `onEnsemble`). Leur bouton de
  44 px est fixe sous ◐ et se comporte comme lui : ouvert ou fermé, il reste à sa place (enfoncé quand la fenêtre
  est ouverte) et garde le focus ; la fenêtre, à part, s'ouvre sous lui (à gauche de la colonne sur un téléphone
  tenu à l'horizontale). Hors de la vue d'ensemble, il ramène à la France entière (Q23). Dans le volet, les encarts
  s'ouvrent en plein cadre sur la carte, à gauche de la colonne (grande grille, au-dessus de la légende repliée), le
  volet réduit à sa barre ; il remonte quand on les referme, qu'on revient à la France (encarts alors refermés) ou
  qu'on choisit un territoire (sa fiche). Une seule fenêtre à la fois dans le volet : ouvrir les encarts replie la
  légende, et inversement, sans changer les préférences gardées.
  Collectivités sans contour de circonscription (977, 978, 986, 987, 988) : leurs encarts gardent les communes aux
  législatives. Polynésie : Tahiti et Moorea seulement (note sous les encarts). Wallis-et-Futuna : un seul code de
  résultats (98601) ; carte et index fusionnent ses trois circonscriptions territoriales (`geo.py`), l'encart
  dessine ses deux groupes d'îles en deux moitiés. Les contours des circonscriptions d'outre-mer
  portent le code INSEE des résultats (« 971-01 »), pas celui du ministère (« ZA-01 ») : un test le vérifie.
- Cadrage dans le fragment de l'URL (`#zoom/lat/lon`, `lireCadre` et `ecrireCadre` de `vue.ts`, décision Q18) :
  écrit à chaque `moveend` par `replaceState` (jamais d'entrée d'historique) ; Précédent et Suivant (`popstate` du
  navigateur, `hashchange`) y ramènent la carte ; un lien qui en porte un n'est pas recadré sur son territoire. Pas
  l'option `hash` de MapLibre : `remove()` efface le fragment, ce que fait le double montage de StrictMode.
- Deux mises en page (décision Q22), même requête dans `styles.css` et `carte/place.ts` : panneau à gauche
  (≥ 1 024 px, ou dès 568 px à l'horizontale avec un panneau de 320 px ; sous 761 px, téléphone tenu ainsi, ce qui
  est posé sur la carte se resserre comme dans le volet) ; volet en bas (téléphone, tablette tenue verticalement,
  texte centré sur 640 px). Panneau (languette, fine barre du volet), légende et encarts repliables ;
  préférences dans `preferences.ts` (`localStorage`, jamais dans l'URL) ; au premier passage, repli selon la
  largeur (`repliParDefaut` : légende repliée sous 1 280 px et dans le volet, encarts dépliés dès 1 500 px). Dans
  le volet, la légende est sur la carte, en bas à gauche au-dessus des sources (titre en 14 px, comme les onglets ;
  décision Q24). Une fenêtre posée sur la carte qui n'y tient pas (encarts, légende dépliée) réduit le volet à sa
  barre le temps de la lire (`voletReduitPour`, jamais gardé ; seul le repli choisi, `panneauReplie`, l'est).
- Cadrage : `marges()` de `carte/place.ts` (testé) laisse la place à ce qui est déplié, pour que rien ne cache la
  métropole : légende à gauche, encarts dépliés à droite (métropole entière seulement : zoomée, la carte les
  masque ; pas dans le volet, où ils s'ouvrent en plein cadre), volet, sources et légende repliée en bas ; faute
  de place, encarts puis
  légende se posent sur la carte. Les marges suivent le retrait `--cadre-carte` (24 ou 12 px) ; dans le volet, la
  colonne du zoom ne descend pas jusqu'à la Corse, 32 px suffisent à en dégager l'Alsace. Dans le volet, activer la
  recherche le déplie (suggestions au-dessus du clavier). En vue
  d'ensemble, la métropole se recadre quand la place change (`resize`, légende, encarts, volet du téléphone) ; une
  carte zoomée ou le cadrage d'un lien partagé ne bougent pas. Mentions des sources brèves (une ligne de
  téléphone), posées à gauche sur le volet.
- Commune ou arrondissement sélectionné : contour détaillé demandé à `geo.api.gouv.fr` (API officielle, CORS
  ouvert ; `type=arrondissement-municipal` à Paris, Lyon et Marseille). Le contour simplifié ne sert qu'en secours,
  par un filtre (`communes-selection`) posé seulement si l'API échoue, jamais par l'état des communes. Dans le
  panneau intégré, MapLibre attend une image (`requestAnimationFrame`) pour charger son style : une capture d'écran
  la déclenche, ce n'est pas un bug du site.

## Couleurs et accessibilité

- Toute palette passe le validateur du skill `dataviz` (`node scripts/validate_palette.js "<hex,…>" --pairs all`)
  **à chaque niveau d'opacité utilisé par défaut**. Seule exception : le curseur d'opacité sur le plan (10 à 100 %,
  décision Q19), réglé par l'utilisateur ; la valeur par défaut (70 %) est validée, et la couleur reste doublée par
  l'infobulle et la fiche. Carte « En tête » en couleurs pleines (l'avance ne se lit que dans le
  texte : un palier de clarté confondrait les blocs). Évolution : seuils fixes ±2, ±5, ±10, ±20. Les dégradés
  (Score dans la teinte du bloc, Participation en sarcelle, bras de l'Évolution) passent `--ordinal`, sur le
  fond papier `#F6F4EF`. Palettes dans `app/src/carte/couleurs.ts`.
- Couleur toujours doublée (légende, panneau de détail, vue tableau à venir). Charte sobre et neutre, sans
  codes visuels de l'État (DSFR, Marianne).
- Direction visuelle « A · Éditorial » : Newsreader (titres) et Source Sans 3 (texte), **auto-hébergées** par
  `@fontsource-variable` (pas de Google Fonts : aucune requête vers un tiers).
- Typographie (25/09) : **une seule échelle de 6 tailles**, variables `--t-*` de `styles.css` (12, 14, 16, 18,
  24, 32 px) ; aucune taille en dur. Newsreader seulement pour le titre de la page et les grands chiffres ;
  Source Sans 3 en 400 et 600 pour tout le reste ; deux encres (`--encre`, `--encre-2`) ; un seul style de
  capitales espacées (`.marque`, `.surtitre`). Noms de personnes à trait d'union insécable (`nomCandidature`).
- Boutons (décision Q26) : quatre familles. Champs et boutons de 44 px : arrondi 6 px, bord `--bord-champ`, fond
  `--blanc` dans le panneau, `--surface` sur la carte, survol et état ouvert `--piste`, icônes de 20 px au trait de
  2 px (zoom compris) ; onglets en pilule ; liens soulignés (`.lien`, 24 px de haut au moins) ; titres dépliants à
  chevron (légende, encarts au même style, tableaux `.depliant`). Tous dans la police du site (`button { font:
  inherit }`). Couleurs du CSS en variables ; seules les icônes en `data:` écrivent l'encre en clair.
- Espacements : grille de 4 px (4, 8, 12, 16, 24, 32 ; aucune autre valeur) ; trois variables font le rythme,
  resserrées sur mobile : `--marge-panneau` (40/24), `--ecart-sections` (24/16), `--cadre-carte` (24/12, retrait
  commun des onglets, du zoom, des encarts et de la légende).

## Style de code

- Noms de variables, de fonctions et commentaires **en français** ; commentaires rares, qui expliquent le pourquoi.
- TypeScript strict (`verbatimModuleSyntax` : `import type`), pas de `any`.
- Commits en français ; pas de push sans accord explicite de l'utilisateur.
