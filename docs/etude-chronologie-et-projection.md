# Étude — Statistiques chronologiques et projection 2027

> **Statut : étude, 24 septembre 2026.** Demandée le 24/09 : « étudier comment visualiser des statistiques
> chronologiques, voire simuler une projection pour 2027 ». Rien n'est décidé ; les choix proposés sont en fin
> de document. Rappel : le plan (§ 2.4) range aujourd'hui « sondages, projections, prédictions » hors du
> périmètre, au nom de la mission de transparence. Une projection remettrait ce choix en cause.

## 1. Ce que les données permettent

- **56 tours de scrutin** sont disponibles dans la source officielle, de 1999 à 2026, au bureau de vote :
  présidentielles (2002 à 2022), législatives (2002 à 2024), européennes (1999 à 2024), régionales,
  cantonales puis départementales, municipales (2008 à 2026).
- **Des séries continues par territoire** deviennent possibles grâce à trois briques déjà en place :
  - la table de passage vers le COG 2026 (commune fusionnée → commune actuelle) ;
  - la grille des blocs appliquée à tous les scrutins (circulaire de 2026), une fois les nuances
    historiques classées ;
  - les circonscriptions, stables de 2012 à 2024 (découpage de 2010).
- **Limites à afficher à chaque fois** :
  - l'offre change d'un scrutin à l'autre (candidats absents, alliances) ;
  - les types d'élection ne se comparent pas entre eux (participation, enjeux) ;
  - les blocs sont appliqués rétroactivement : le « centre » n'existe comme force autonome que depuis
    2017 ;
  - les petites communes n'ont pas de nuance aux municipales.

## 2. Visualiser le temps : options

| Vue | Question | Public | Coût | Avis |
|---|---|---|---|---|
| **Au fil des scrutins** (panneau de détail) : une petite courbe par bloc pour le territoire choisi, un panneau par type d'élection | « Comment ma commune a-t-elle voté depuis 2002 ? » | Tous | Moyen | **Recommandé en premier** : prolonge le parcours actuel |
| Courbes nationales et départementales par bloc, présidentielles seules | « Quelle tendance de long terme ? » | Grand public, journalistes | Faible | Recommandé |
| Petits multiples de cartes (les 5 premiers tours de présidentielle côte à côte) | « Où la géographie a-t-elle changé ? » | Journalistes, chercheurs | Moyen | Recommandé, au département |
| Carte des bascules : communes dont le bloc en tête a changé entre deux scrutins | « Où ça a basculé ? » | Journalistes | Faible (le mode Évolution fait presque tout) | Utile |
| Tableau chaud territoire × scrutin | « Quels territoires suivent quelle trajectoire ? » | Analystes, chercheurs | Moyen | Mode avancé |
| Carte animée avec curseur temporel | — | — | Moyen | **Déconseillé** : l'œil suit le mouvement, pas les valeurs ; comparer deux années y est plus dur qu'avec des petits multiples |

Règles à garder :
- un type d'élection par courbe ;
- les 5 couleurs de bloc validées ;
- des étiquettes directes ;
- une vue tableau pour chaque graphique ;
- les ruptures (changement de bloc d'un parti, fusion de communes) signalées sur l'axe.

**Données à publier.** Une série « part de chaque bloc par territoire et par scrutin », avec :
- France, départements et circonscriptions dans un seul petit fichier ;
- les communes découpées par département, chargées à la demande.

Ordre de grandeur : 35 000 communes × 56 tours × 7 blocs, soit environ 14 millions de valeurs. Découpé par
département, cela fait quelques centaines de Ko par fichier.

**Graphiques.** Un petit composant SVG maison suffit pour les courbes, comme les barres actuelles : sans
dépendance, et doublé d'un tableau accessible. ECharts, prévu au plan, ne deviendrait utile que pour le mode
avancé.

## 3. Projection 2027 : trois approches

| Approche | Principe | Données | Risques | Avis |
|---|---|---|---|---|
| **A. Simulateur de scénarios** (« et si… ? ») | L'utilisateur fixe les scores nationaux des blocs (ou leur écart à 2022). L'outil applique ce glissement à chaque territoire, uniforme (en points) ou proportionnel, et montre la carte qui en résulte | Nos résultats seulement | Faibles si c'est présenté clairement comme une hypothèse de l'utilisateur, jamais comme une prévision | Seule option compatible avec la mission, **si** le périmètre est rouvert |
| B. Projection statistique | Un modèle, nourri de sondages nationaux, prévoit le vote par territoire | Sondages (rarement ouverts), historiques | **Juridiques** : la loi n° 77-808 du 19 juillet 1977 encadre la publication des sondages et de leurs dérivés, sous le contrôle de la Commission des sondages, et l'interdit la veille et le jour du vote. **Crédibilité** : un outil de transparence qui « prédit » perd sa neutralité | **Déconseillé** |
| C. Tendances prolongées | Prolonger les courbes passées jusqu'en 2027 | Historiques | Méthodologiquement faux : les scores ne suivent pas de tendance linéaire, et l'offre de 2027 est inconnue | **Déconseillé** |

Si l'approche A est retenue, garde-fous proposés :
- **un espace séparé** (« Simulateur »), avec un code visuel distinct : bandeau « Simulation — ce n'est pas
  une prévision », hachures, aucune couleur pleine de résultat ;
- **par défaut, le résultat réel de 2022**, jamais un scénario présenté comme probable, et aucun sondage
  importé ;
- **une méthode publiée** : glissement uniforme ou proportionnel, niveau choisi (département ou commune),
  limites. Le glissement ignore les reports de voix, la participation différentielle et les candidatures
  nouvelles ;
- **pas de sièges** : aux législatives, projeter des sièges suppose des hypothèses de second tour
  (désistements, alliances) trop fortes ;
- **par prudence, désactivé** la veille et le jour des scrutins nationaux.

Calendrier réaliste : après la bêta publique, en phase 4 (§ 13), une fois l'historique en ligne.

## 4. Décisions proposées

1. Commencer par la vue « Au fil des scrutins » dans le panneau de détail, puis les courbes nationales et les
   petits multiples des présidentielles.
2. Projection 2027 : choisir entre garder le périmètre actuel (pas de projection) et ajouter un simulateur de
   scénarios (approche A, avec ses garde-fous, après la bêta). Les approches B et C sont écartées.
