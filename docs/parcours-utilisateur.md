# Parcours de l'utilisateur

Carte des vues de l'atlas, de ce qui mène de l'une à l'autre, et des règles qui les gardent cohérentes. À relire
et à tenir à jour à chaque nouvel écran, lien ou sélecteur. Revue du 25/09/2026.

## L'état d'une vue

Tout l'état de la vue tient dans l'URL (`app/src/vue.ts`), cadrage de la carte compris : un lien reproduit
exactement ce qu'on voit.

| Paramètre | Valeurs | Rôle |
|---|---|---|
| `scrutin` | `2022_pres_t1`… | Scrutin affiché (par défaut : premier tour de la dernière présidentielle) |
| `mode` | `score`, `participation`, `evolution` | Ce que montre la carte (par défaut : « En tête ») |
| `cible` | `c12`, `bEXD` | Score : candidature ou bloc suivi |
| `bloc`, `de` | `DTE`, `2017_pres_t1` | Évolution : bloc suivi et scrutin de départ (l'arrivée est `scrutin`) |
| `sel` | `commune:69123`, `bureau:69123_0816`… | Territoire choisi : département, circonscription, commune, arrondissement ou bureau |
| `page` | `methodologie` | Page affichée dans le panneau à la place des résultats |
| `#zoom/lat/lon` | `#11.2/45.7641/4.8357` | Cadrage de la carte (fragment), noté à chaque fin de mouvement sans créer d'entrée d'historique (décision Q18) |

## Le graphe

```mermaid
flowchart TB
  classDef reglage fill:#ece8df,stroke:#57534a,color:#1b1a17
  classDef carte fill:#dde8ee,stroke:#3558a6,color:#1b1a17

  lien(["Accueil ou lien partagé<br/>?scrutin · mode · cible · bloc · de · sel · page #zoom/lat/lon"])

  subgraph panneau["Panneau"]
    direction TB
    entete["En-tête : Atlas électoral · Méthodologie"]
    recherche["Recherche : adresse, commune, département,<br/>circonscription, code postal, code INSEE"]
    reglages["Réglages partagés<br/>Scrutin · Candidature ou bloc (Score) · Bloc, De, À (Évolution)"]:::reglage
    subgraph apercu["Vue nationale"]
      direction TB
      synthese["Synthèse du mode : barres, départements extrêmes"]
      raccourcis["Outre-mer et Français de l'étranger"]
    end
    subgraph fiche["Fiche d'un territoire"]
      direction TB
      ariane["Fil d'Ariane · bouton ×"]
      niveaux["Département · Circonscription · Commune · Arrondissement · Bureau"]
      sansResultat["Sans résultat à ce scrutin :<br/>la raison et un lien vers le territoire qui en a"]
    end
    chrono["Au fil des scrutins : type d'élection, courbes, données"]
    methodo["Méthodologie : sources, grille, qualité du scrutin · Retour"]
  end

  subgraph carte["Carte"]
    direction TB
    onglets["Onglets : En tête · Score · Participation · Évolution"]:::carte
    ensemble["Vue d'ensemble : communes (circonscriptions aux législatives)<br/>et encarts petite couronne, départements et collectivités d'outre-mer"]:::carte
    replis["Replis : panneau (languette, fine barre sur téléphone),<br/>légende et encarts (leur titre)"]:::carte
    bureaux["Zoom des bureaux : bureaux sur le Plan IGN"]:::carte
    opacite["Bouton ◐ : opacité des couleurs sur le plan<br/>(actif au zoom des bureaux)"]:::carte
  end

  lien --> apercu
  lien -->|"sel=… : son cadrage (sinon celui du territoire), volet déplié"| fiche
  reglages -->|"garde le territoire et le mode"| apercu & fiche
  onglets -->|"garde le territoire et les réglages"| apercu & fiche
  recherche -->|"territoire : cadrage"| niveaux
  recherche -->|"adresse : vol jusqu'à la rue, repère,<br/>bureau qui la contient (commune avant 2022)"| niveaux
  opacite -->|"préférence du navigateur"| bureaux
  replis -->|"préférences du navigateur ; en vue d'ensemble, la métropole se recadre"| ensemble
  synthese -->|"un département : cadrage"| niveaux
  raccourcis -->|"cadrage"| niveaux
  ensemble -->|"clic, sans déplacer la carte"| niveaux
  ensemble -->|"clic dans un encart : cadrage"| niveaux
  bureaux -->|"clic"| niveaux
  ariane -->|"étape parente : cadrage"| niveaux
  ariane -->|"France ou × : cadrage sur la France"| apercu
  sansResultat -->|"département, commune ou arrondissement"| niveaux
  entete --> methodo
  methodo -->|"Retour aux résultats"| apercu & fiche
```

## Ce que fait chaque commande

| Commande | Où | Effet sur l'URL | Carte |
|---|---|---|---|
| Choisir un scrutin | Réglages, Méthodologie | `scrutin` ; efface `cible` | Recoloriée, même cadrage |
| Choisir une candidature ou un bloc | Réglages (Score) | `cible` | Recoloriée |
| Choisir le bloc ou le départ | Réglages (Évolution) | `bloc`, `de` | Recoloriée |
| Changer de mode | Onglets de la carte | `mode` | Recoloriée |
| Choisir un résultat de recherche | Recherche | `sel` ; efface `page` | Cadrée sur le territoire |
| Choisir une adresse | Recherche | `sel` : la commune (ou l'arrondissement) aussitôt, dans une nouvelle entrée ; puis, dans la même entrée, le bureau dont le contour contient l'adresse (sauf si la carte du scrutin s'arrête à la commune) ; efface `page` | Vol jusqu'à la rue, repère sur l'adresse |
| Régler l'opacité des couleurs | Bouton sous le zoom | aucun : préférence gardée par le navigateur | Couleurs des bureaux de 10 à 100 % sur le plan (70 % par défaut) |
| Replier ou rouvrir le panneau | Languette au bord (ordinateur), bouton ▾ du volet ou poignée (téléphone) | aucun : préférence gardée par le navigateur | Toute la largeur (ordinateur) ou tout l'écran (téléphone) ; en vue d'ensemble, la métropole se recadre |
| Replier la légende | Son titre | aucun : préférence gardée par le navigateur | En vue d'ensemble, la métropole se recadre dans la place libérée |
| Replier les encarts | Leur titre « Petite couronne et outre-mer » | aucun : préférence gardée par le navigateur (repliés par défaut sur téléphone) | — |
| Cliquer un département extrême, un raccourci | Vue nationale | `sel` | Cadrée sur le territoire |
| Cliquer un territoire | Carte | `sel` ; efface `page` | Immobile (le territoire est à l'écran) |
| Cliquer un territoire dans un encart | Encarts | `sel` | Cadrée sur le territoire |
| Cliquer le nom d'un encart | Encarts | aucun | Cadrée sur l'encart |
| Remonter le fil d'Ariane | Fiche | `sel` | Cadrée sur l'étape |
| Fermer la fiche (×) | Fiche | efface `sel` | Cadrée sur la France |
| Méthodologie, Retour aux résultats | En-tête, Méthodologie | `page` | Inchangée |
| Déplacer ou zoomer la carte | Carte | fragment `#zoom/lat/lon`, sans nouvelle entrée d'historique | — |
| Précédent, Suivant | Navigateur | vue précédente ou suivante | Revient au cadrage de cette vue |

## Règles de cohérence

1. **L'URL est la seule source de l'état de la vue**, cadrage de la carte compris. Un lien reproduit la vue ;
   Précédent et Suivant la parcourent, carte comprise. Déplacer la carte ne crée pas d'entrée d'historique : elle
   met à jour le cadrage de la vue courante.
2. **Les réglages sont au même endroit dans les deux vues** (`panneau/Reglages.tsx`) : en tête de la vue
   nationale, sous le fil d'Ariane dans la fiche (« où » d'abord, puis « quoi »). Ils ne dépendent que du
   catalogue : pendant le chargement d'un autre scrutin, ils restent en place et le sélecteur garde le focus. La
   page Méthodologie n'en a pas : son propre choix de scrutin règle le rapport qualité, et le scrutin affiché
   avec lui.
3. **Changer un réglage ou de mode ne fait jamais quitter le territoire choisi.** Un nouveau scrutin efface la
   cible (ses candidatures sont autres) ; le mode, le bloc et le départ restent.
4. **Un territoire sans résultat garde sa fiche**, qui dit pourquoi et mène au territoire qui en a : une
   circonscription hors des législatives de 2012 et après renvoie à son département ; un bureau absent (la
   numérotation change d'une élection à l'autre, un bureau peut ne pas revoter au second tour) à sa commune ou à
   son arrondissement, s'ils ont voté ; un département absent de la source le dit ; au second tour d'un scrutin
   local, l'élection a pu se décider dès le premier. Revenir au scrutin d'avant retrouve le territoire : rien
   n'est perdu en passant.
5. **Évolution : le départ précède l'arrivée**, ou tombe le même jour (régionales et départementales de 2021).
   Le premier scrutin de l'atlas (européennes de 1999) n'a pas de départ : la carte reste vide et le panneau le
   dit.
6. **Le panneau déplace la carte, la carte ne se déplace pas d'elle-même** : recherche, listes, raccourcis, fil
   d'Ariane et fermeture cadrent la carte ; un clic sur la carte montre un territoire déjà à l'écran ; un lien
   partagé s'ouvre sur son cadrage, ou, s'il n'en porte pas, sur le territoire choisi.
7. **Les encarts appartiennent à la vue d'ensemble** : au plus un niveau de zoom au-delà de la métropole
   entière, dont le zoom dépend de l'écran. Zoomée sur une région, la carte n'en a plus besoin. Ils montrent la
   petite couronne, les cinq départements et les six collectivités d'outre-mer (la Polynésie par Tahiti et Moorea,
   dit sous les encarts), défilent dans une fenêtre basse et se replient sur leur titre.
8. **Choisir un territoire montre sa fiche** : sur mobile, le volet se déplie (par la carte, la recherche ou un
   lien partagé) ; replié, le panneau se rouvre (ordinateur comme téléphone).
9. **Le titre de l'onglet nomme la vue** (« Lyon · Présidentielle 2022, 1er tour · Score · Atlas électoral »),
   pour l'historique, les favoris et les liens partagés.
10. **Une adresse mène à son bureau de vote** : sa commune (l'arrondissement à Paris, Lyon et Marseille)
    s'affiche aussitôt, dans une nouvelle entrée d'historique, puis le bureau dont le contour de 2022 (indicatif)
    contient l'adresse la précise, dans la même entrée, sauf si la carte du scrutin s'arrête à la commune ou si
    l'on est passé à autre chose entre-temps. Le repère et le rappel de l'adresse accompagnent ce territoire ; leur
    texte suit le scrutin affiché. Le texte tapé ne part au géocodeur de l'IGN que s'il contient un chiffre ou un
    type de voie (rue, avenue, place…).
11. **Les préférences d'affichage ne sont pas dans l'URL** : l'opacité des couleurs et les replis (panneau,
    légende, encarts) sont gardés par le navigateur ; un lien partagé montre l'affichage par défaut.

## Comportements assumés

- « Au fil des scrutins » garde son propre type d'élection, par défaut celui du scrutin affiché : c'est un choix
  de lecture, indépendant de la carte.
- Un bureau choisi reste désigné par son numéro d'un scrutin à l'autre : même numéro, pas forcément même
  périmètre (contours de 2022). La Méthodologie le rappelle ; l'Évolution se lit à la commune.
- La marque « Atlas électoral » n'est pas un lien : la croix de la fiche et « Retour aux résultats » ramènent à
  la vue nationale.

## Parcours vérifiés (25/09, navigateur, 1 280 × 800 et 375 × 812)

| Parcours | Attendu |
|---|---|
| `?mode=score&sel=commune:69123`, puis une autre candidature | Lyon reste choisi ; la part de la candidature suit |
| `?scrutin=2024_legi_t1&sel=circonscription:69-02`, puis Présidentielle 2022 | « Rhône, 2e circonscription » ; résultats par circonscription réservés aux législatives ; lien vers le Rhône |
| … puis Législatives 2022 | La circonscription retrouve ses résultats |
| … puis Législatives 2007 | Pas de circonscription dans les données de ce scrutin (depuis 2012) ; lien vers le Rhône |
| `?scrutin=2020_muni_t2&sel=bureau:01001_0001` | Commune sans second tour : pas de lien vers une fiche vide |
| Vue nationale, raccourci Guadeloupe, puis Précédent et Suivant | La carte revient sur la métropole, puis sur la Guadeloupe, avec le panneau |
| `?sel=commune:69123#12.5/45.764/4.836` | Carte au cadrage du lien (zoom 12,5), pas recadrée sur la commune |
| Recherche « 12 rue de la paix paris », première adresse | Vol jusqu'à la rue, repère, fiche « Paris, bureau 0203 » avec l'adresse rappelée ; la croix recadre ensuite sur la France |
| `?scrutin=2017_pres_t1`, recherche « place bellecour lyon » | Lyon 2e Arrondissement (carte à l'arrondissement pour ce scrutin), adresse rappelée |
| Bouton ◐ au zoom des bureaux, curseur à 30 %, puis « Revenir à 70 % » | Plan lisible sous les couleurs ; réglage gardé d'une visite à l'autre, puis effacé |
| Bouton ◐ en vue nationale | Curseur grisé : « zoomez pour l'utiliser » |
| Replier légende et encarts, puis la languette du panneau (1 024 × 768) | La métropole s'agrandit à chaque place libérée ; la languette « › » rouvre le panneau |
| `?sel=commune:69123#12.5/45.764/4.836`, légende repliée | Cadrage du lien conservé (zoom 12,5), pas de recadrage sur la France |
| Téléphone, premier passage | Encarts repliés sur leur titre ; bouton ▾ : volet réduit à une fine barre, la poignée le rouvre |
| Encarts dépliés | Collectivités coloriées : Wallis-et-Futuna en deux moitiés (un seul résultat, 98601), Polynésie par Tahiti et Moorea |
| `?scrutin=2022_pres_t1&sel=bureau:75056_2099` | Aucun bureau n° 2099 ; lien vers Paris 20e |
| `?scrutin=2017_pres_t1&mode=evolution&de=2022_pres_t1` | Départ ramené à 2012 ; aucun départ postérieur proposé |
| `?scrutin=1999_euro_t1&mode=evolution` | Pas de « De », message, carte vide, pas de légende |
| Vue nationale, zoom avant puis arrière | Encarts masqués au-delà d'un niveau de zoom, puis de retour |
| Fiche, ×, Méthodologie, Précédent | Vue nationale ; Méthodologie sans réglages ; retour à la vue nationale |
| Mobile, `?mode=evolution&sel=commune:69123` | Volet déplié : fil d'Ariane, réglages, puis « Lyon » et l'écart du bloc |
