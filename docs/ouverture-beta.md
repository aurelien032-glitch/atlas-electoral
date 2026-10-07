# Ouverture de la bêta

Le site est prêt à être annoncé (décision Q32 du [plan](PLAN.md), le 07/10/2026). Ce document rassemble ce qui
est en place, les démarches qui passent par les comptes de l'éditeur, et des textes prêts à publier.

## En place sur le site

- **Mention « bêta »** dans l'en-tête du panneau ; la Méthodologie s'ouvre sur ce qu'elle signifie.
- **Signaler une erreur** : un lien dans chaque fiche, dans l'aperçu et dans la Méthodologie ouvre un ticket public
  sur le dépôt (formulaire `.github/ISSUE_TEMPLATE/erreur.yml`), l'adresse de la vue et son titre déjà remplis.
  Un compte GitHub, gratuit, est nécessaire.
- **Mentions légales et vie privée** (fin de la Méthodologie) : éditeur particulier, à titre non professionnel ;
  hébergeur Cloudflare ; ni cookie ni mesure d'audience ; services appelés par le navigateur.
- **Référencement** : `robots.txt` ouvert, plan du site (`/sitemap.xml` : accueil, Méthodologie, vue nationale de
  chaque scrutin), aperçus de partage (Open Graph, image `partage.png` : participation par département aux
  législatives de 2024). Les adresses propres à chaque déploiement (`xxxx.atlas-electoral.pages.dev`) sont exclues
  des moteurs par Cloudflare (`X-Robots-Tag: noindex`).
- **Lecteur d'écran** : essai avec NVDA 2026.2 le 07/10 (voir le plan, revue P0, point 5).

## Démarches de l'éditeur

Elles passent par des comptes personnels : à faire soi-même, dans cet ordre.

1. **Cloudflare** : l'anonymat de l'éditeur particulier suppose que l'hébergeur connaisse son identité (loi pour
   la confiance dans l'économie numérique). Vérifier que le profil du compte « Atlas électoral » porte nom, adresse
   et téléphone.
2. **Google Search Console** (search.google.com/search-console) : propriété « Préfixe d'URL »
   `https://atlas-electoral.pages.dev/` ajoutée le 07/10, méthode « Fichier HTML » ; le fichier
   `app/public/googleb31fea893cb9d56d.html` est publié et doit y rester (Google revérifie). Ensuite « Valider », et
   soumettre `sitemap.xml` dans « Sitemaps ».
3. **Bing** et les autres moteurs IndexNow : rien à faire, « Publier » leur signale le plan du site à chaque
   publication. Bing Webmaster Tools (bing.com/webmasters) n'est utile que pour suivre les statistiques ; il demande
   un compte.
4. **data.gouv.fr** : publier une réutilisation (texte ci-dessous) depuis son compte, avec l'image
   `app/public/partage.png`.
5. **GitHub** : champ « Website » du dépôt (`gh repo edit --homepage https://atlas-electoral.pages.dev`).
6. **Annonce** : textes ci-dessous.

## Réutilisation sur data.gouv.fr

- **Titre** : Atlas électoral
- **Type** : Visualisation
- **Thématique** : Élections
- **Lien** : https://atlas-electoral.pages.dev
- **Jeux de données associés** :
  - Données des élections agrégées (ministère de l'Intérieur)
  - Élections législatives des 30 juin et 7 juillet 2024, résultats définitifs du 1er tour (et du 2d tour)
  - Proposition de contours des bureaux de vote
  - Contours administratifs
  - Base officielle des codes postaux
  - Code officiel géographique

**Description** :

> L'Atlas électoral montre les résultats officiels des élections françaises, de la France entière jusqu'au bureau
> de vote : 56 tours de scrutin de 1999 à 2026 (présidentielles, législatives, européennes, régionales,
> départementales et cantonales, municipales).
>
> La carte colore chaque territoire selon le bloc en tête, le score d'une candidature ou d'un bloc, la
> participation, ou l'évolution entre deux scrutins. Chaque fiche donne les voix et les parts des candidatures,
> avec leur nuance officielle et leur bloc, et les compare au territoire qui l'englobe quand les mêmes
> candidatures s'y présentent. La carte descend au bureau de vote depuis 2022 (contours de 2022, complétés par les
> découpages publiés par les villes) ; avant, elle s'arrête à la commune.
>
> Les chiffres viennent des fichiers du ministère de l'Intérieur publiés sur data.gouv.fr ; les totaux sont
> rapprochés des totaux officiels et les manques de la source sont signalés, jamais corrigés. Le site ne fait ni
> prévision ni commentaire. Code ouvert (AGPL-3.0) : https://github.com/aurelien032-glitch/atlas-electoral

## Textes d'annonce

**Court** (Mastodon, Bluesky, X) :

> Atlas électoral, en bêta : les résultats officiels des élections françaises depuis 1999, de la France entière
> à la commune, et jusqu'au bureau de vote depuis 2022. Carte, voix de chaque candidature, sources citées, code
> ouvert. Une erreur ? Chaque fiche permet de la signaler. https://atlas-electoral.pages.dev

**Long** (LinkedIn, forums, listes de diffusion) :

> J'ouvre en version bêta l'Atlas électoral, une carte des résultats officiels des élections françaises :
> 56 tours de scrutin depuis 1999, de la France entière jusqu'au bureau de vote depuis 2022.
>
> Pour chaque commune, circonscription ou bureau : participation, voix et parts de chaque candidature, nuance
> officielle, comparaison avec le territoire qui l'englobe, évolution d'un scrutin à l'autre. Les données viennent du
> ministère de l'Intérieur via data.gouv.fr ; la page Méthodologie cite chaque source et dit ce qui a été vérifié.
> Pas de prévision, pas de commentaire, ni cookie ni mesure d'audience ; le code est ouvert (AGPL-3.0).
>
> C'est une bêta : si un chiffre, une carte ou un classement vous semble faux, le lien « Signaler une erreur » de
> chaque fiche ouvre un ticket public.
>
> https://atlas-electoral.pages.dev
