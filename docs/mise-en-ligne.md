# Mise en ligne sur Cloudflare Pages

Le site est entièrement statique (ADR-001, plan § 5) : l'application construite par Vite et les fichiers
publiés par le pipeline, déposés sous `/data/v1`. Hébergement : Cloudflare Pages, offre gratuite
(0 € strict) : 20 000 fichiers et 25 Mio par fichier au plus, bande passante illimitée pour les fichiers
statiques. Une publication compte environ 860 fichiers et 170 Mo ; le plus gros, les contours des
communes, pèse 8,2 Mo.

## Ce que fait la CI (GitHub Actions)

| Workflow | Déclenchement | Rôle |
|---|---|---|
| `Vérifications` (`.github/workflows/verifications.yml`) | chaque envoi sur `main`, chaque demande de fusion | Application : TypeScript, lint, tests, build. Pipeline : compilation, chargement des tests |
| `Publier` (`.github/workflows/publier.yml`) | à la main (onglet **Actions**, « Run workflow ») | Reconstruit toutes les données depuis les sources officielles (contours, circonscriptions, 56 tours, séries : 15 à 25 min), lance les quelque 650 contrôles, construit le site, pose à sa racine le plan du site (`sitemap.xml`, écrit par `construire`) et le déploie. **Rien n'est déployé si un contrôle échoue.** Le rapport qualité (manifestes et résultat des contrôles) est joint à chaque exécution (artefact `rapport-qualite`) |

Aucune donnée n'est versionnée : chaque publication repart des sources, ce qui la rend reproductible.

## Réglages faits une fois (le 25/09/2026)

Création de compte et copie du jeton demandent vos identifiants : elles ne peuvent pas être faites à votre
place.

1. **Compte Cloudflare dédié** : « Atlas électoral », créé depuis le sélecteur de compte (*+ Créer un compte*),
   à part du compte qui héberge un autre projet (« thermae »). Un jeton Pages vaut pour tout un compte, sans
   limite par projet : sur un compte partagé, il pourrait écraser l'autre site. **Ne jamais publier l'Atlas
   depuis un autre compte.**
2. **Identifiant du compte** : *Workers et Pages*, colonne de droite, *Account ID*.
3. **Jeton de compte** (recommandé par Cloudflare pour l'automatisation, car il n'est lié à aucune
   personne) : *Gérer le compte* → *Jetons d'API du compte* → *Créer un jeton* → *Commencer à zéro*, une
   seule permission : *Developer Platform* → *Pages* → *Edit*. Nom « atlas-electoral · Publier (GitHub
   Actions) », **sans expiration** (décision du 25/09 : pas de renouvellement à prévoir ; la portée reste
   étroite, les Pages de ce seul compte). S'il fuit un jour : le supprimer (*Jetons d'API du compte* → « … » →
   *Supprimer*), en créer un autre et remplacer le secret. Le jeton ne s'affiche qu'une fois : le copier
   directement dans GitHub, jamais ailleurs (conversation, fichier, message).
4. **Secrets GitHub** : *Settings* → *Secrets and variables* → *Actions* :
   - `CLOUDFLARE_API_TOKEN` : le jeton de l'étape 3 ;
   - `CLOUDFLARE_ACCOUNT_ID` : l'identifiant de l'étape 2.
5. **Publication** : onglet *Actions* → *Publier* → *Run workflow* (ou `gh workflow run publier.yml`). La
   première exécution crée le projet Pages `atlas-electoral` ; le site est servi à l'adresse
   `https://atlas-electoral.pages.dev` (Cloudflare ajoute un suffixe si le nom est déjà pris : l'adresse
   exacte s'affiche à la fin du journal).

## En-têtes HTTP et sécurité

Les en-têtes sont dans `app/public/_headers`, copié tel quel dans le site :
- **politique de sécurité (CSP)** : scripts, styles et polices du site seulement ; connexions permises vers
  le site, le PMTiles officiel des bureaux (stockage OVH de data.gouv), `geo.api.gouv.fr` (contour d'une
  commune) et `data.geopf.fr` (Plan IGN et géocodeur des adresses). Tout nouveau service appelé par le
  navigateur doit y être ajouté, sinon il sera bloqué ;
- `frame-ancestors 'none'` : le site ne peut pas être intégré dans une page tierce (à rouvrir si l'on
  propose des cartes à intégrer) ;
- cache : un an pour `/assets/*` (noms tirés du contenu), revalidation à chaque visite pour `/data/*`.

Vérification en local, avec les mêmes en-têtes qu'en ligne :

```bash
cd app && npm run build && npm run preview   # http://localhost:4173, données lues dans ../publication
```

## Référencement et ouverture

- `app/public/robots.txt` ouvre tout le site aux moteurs et donne l'adresse du plan du site (`/sitemap.xml` :
  accueil, Méthodologie, vue nationale de chaque scrutin ; le sélecteur de scrutin n'est pas un lien qu'un robot
  suivrait). Les adresses propres à chaque déploiement reçoivent de Cloudflare `X-Robots-Tag: noindex`.
- IndexNow (Bing, Yandex, Seznam, Naver…), sans compte : la clé publique `app/public/5f1185e309d72f01c4f9adc5945c01ad.txt`
  prouve que l'envoi vient de l'éditeur ; la dernière étape de « Publier » leur signale les adresses du plan du site
  (un échec n'y annule rien). Google n'utilise pas IndexNow : il lit le plan du site déclaré dans Search Console.
- Aperçus de partage (Open Graph) dans `app/index.html`, lus sans JavaScript, donc les mêmes pour toutes les vues ;
  image `app/public/partage.png` (1 200 × 630). Ni `og:url` ni lien canonique : chaque vue partagée deviendrait un
  doublon de l'accueil.
- Ouverture de la bêta (décision Q32) : ce qui est en place, démarches de l'éditeur (Search Console, data.gouv.fr,
  annonce) et textes prêts à publier dans [ouverture-beta.md](ouverture-beta.md).
