# Référentiels

Fichiers versionnés, lus par le pipeline (`pipeline/`). Toute modification passe par une pull request argumentée.

| Fichier | Contenu |
|---|---|
| `nuances.csv` | Chaque nuance officielle, avec son **bloc** (grille de la circulaire du ministère de l'Intérieur INTP2602966C de février 2026, appliquée à tous les scrutins, décision du 24/09/2026) et sa **famille** (grille du projet, environ 8 familles). Les nuances antérieures à 2026 (UG, NUP, ENS, LENS, UXD) sont rattachées par analogie à l'union correspondante de la grille 2026. `cas_limite = oui` signale un classement discutable, affiché comme tel dans l'interface. |
| `candidats_nuances.csv` | Nuance attribuée aux candidats sans nuance officielle (présidentielle) : le code de leur parti dans la grille 2026. |
| `totaux_officiels.csv` | Totaux nationaux proclamés, pour le test de réconciliation. N'y entrent que des chiffres vérifiés, avec leur source. |
| `passage_communes_2026.csv` | Ancien code de commune (fusionnée depuis) → commune du COG 2026 de l'INSEE : commune déléguée ou associée vers sa commune de rattachement, sinon la chaîne des événements (fusions, communes nouvelles). Produit par `python -m atlas_pipeline.cog`. |
| `contours_bureaux_2022.parquet` | Liste des bureaux présents dans les contours officiels (millésime 2022), sans la géométrie : sert à mesurer le taux de jointure de chaque scrutin. Produit par `python -m atlas_pipeline.contours`. |

Source de la grille 2026 : jeu data.gouv.fr « Données des élections agrégées », ressource « Dictionnaire des nuances politiques (circulaire INTP2602966C de février 2026) ».
