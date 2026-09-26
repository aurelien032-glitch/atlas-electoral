# Étude — Paris, Lyon et Marseille : arrondissements et secteurs

> **Statut : étude du 24 septembre 2026, demandée le même jour** (revue des exigences P0 avant la bêta :
> « Municipales : résultats par liste et par commune ; secteurs de Paris, Lyon et Marseille »).
> **Décision (Q15, 24/09) : arrondissements et secteurs traités avant l'ouverture de la bêta. Réalisé le
> 24/09 : points 1, 2 et 4 du § 3, et le point 3 sans le nom des secteurs de plusieurs arrondissements, ajouté
> le 26/09 : un arrondissement se compare à son secteur entier (colonne « 1er secteur », « Paris Centre »). La
> table secteur → arrondissements est dans le code du site (`secteurDe`), vérifiée sur les résultats de 2008, 2014
> et 2020 : les arrondissements d'un même secteur y ont exactement les mêmes listes.**

## 1. Constats dans les données

- **Les résultats ne descendent qu'à la commune** : les bureaux des trois villes portent le code de la
  commune (`75056_1512`, `69123_0305`, `13055_0801`), jamais celui de l'arrondissement.
- **Les numéros de bureau donnent l'arrondissement** : les deux premiers chiffres du numéro sont ceux de
  l'arrondissement. Vérifié sur les 56 tours publiés, à quelques bureaux près : à Lyon, un bureau numéroté
  « 00… » depuis 2021 (deux en 2026) ; à Paris, un bureau « JU… » en 2019 et 2022, celui où le ministère
  de la Justice dépouille les votes par correspondance des personnes détenues (13 673 inscrits en 2022) :
  il n'appartient à aucun arrondissement. Ces bureaux restent à l'échelle de la ville. Aux législatives 2024 : Paris 01 à 20 (902 bureaux), Lyon 01 à 09 (305 bureaux, plus le
  bureau `0001`), Marseille 01 à 16 (497 bureaux).
- **Municipales de 2008 à 2020 : un scrutin par secteur.** Chaque liste ne se présentait que dans son
  secteur : entre 164 et 182 listes à Paris selon l'année, de 48 à 81 à Lyon et Marseille. Additionnés à
  la commune, ces scrutins distincts donnaient une liste « en tête » sans signification : à Paris en 2020,
  celle de Francis Szpiner, qui ne se présentait que dans le 16e arrondissement.
- **Municipales 2026 : listes à l'échelle de la ville.** Depuis la réforme de 2025, le conseil municipal
  est élu dans une circonscription unique : 9 listes à Paris, 9 à Lyon, 8 à Marseille dans les données.
  Les conseils d'arrondissement ou de secteur, élus le même jour, n'y figurent pas (à vérifier auprès de
  la source).
- **Secteurs** : un arrondissement à Lyon ; deux arrondissements par secteur à Marseille (8 secteurs) ; à
  Paris, un secteur par arrondissement, sauf « Paris Centre » (1er à 4e arrondissements) depuis 2020.

## 2. Corrigé dès maintenant (24/09)

- La couche des communes contenait aussi les 45 arrondissements, superposés à leur ville et sans aucun
  résultat : survol, clic et recherche y menaient à « Aucun résultat rattaché ». Ils sont retirés de la
  carte et de l'index des territoires.
- Recherche par code postal : La Poste rattache les codes postaux aux arrondissements (69001 → 69381) ; on
  les rattache à la ville (69123), qui porte les résultats.
- Municipales de 2008 à 2020 : dans la fiche et l'infobulle des trois villes, plus de liste « en tête »,
  et une note explique le vote par secteur.

## 3. Proposition

1. **Un niveau « arrondissement »** dans les agrégats des trois villes, pour tous les scrutins, calculé à
   partir du numéro de bureau. Contrôles bloquants : la somme des arrondissements égale la commune (voix
   et participation) ; pour les scrutins cartographiés au bureau, le centre de chaque contour de bureau
   tombe dans son arrondissement (contours des arrondissements d'Etalab).
2. **Sur la carte**, en vue nationale, les arrondissements remplacent la ville (couche des arrondissements
   d'Etalab) ; fiche de chaque arrondissement, avec le fil d'Ariane France › Paris › 15e arrondissement, et
   son historique « Au fil des scrutins ».
3. **Municipales de 2008 à 2020** : la fiche d'un arrondissement donne les listes de son secteur ; un
   secteur de plusieurs arrondissements (Marseille, Paris Centre) se lit aussi en entier, grâce à une table
   secteur → arrondissements versionnée dans `referentiels/`.
4. **Municipales 2026** : la ville garde ses résultats ; les arrondissements montrent les écarts locaux au
   sein d'un même scrutin.

Coût estimé : un à deux jours (pipeline, contrôles, carte, fiche). Les fichiers publiés grossissent peu
(45 lignes d'agrégats de plus par scrutin).

## 4. Décision attendue

Traiter les arrondissements (et les secteurs des municipales jusqu'en 2020) avant l'ouverture de la bêta,
ou juste après ? En attendant, les corrections du § 2 évitent tout résultat trompeur.
