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
| `Publier` (`.github/workflows/publier.yml`) | à la main (onglet **Actions**, « Run workflow ») | Reconstruit toutes les données depuis les sources officielles (contours, circonscriptions, 56 tours, séries : 15 à 25 min), lance les 573 contrôles, construit le site et le déploie. **Rien n'est déployé si un contrôle échoue.** Le rapport qualité (manifestes et résultat des contrôles) est joint à chaque exécution (artefact `rapport-qualite`) |

Aucune donnée n'est versionnée : chaque publication repart des sources, ce qui la rend reproductible.

## Réglages à faire une fois (par vous)

Ces étapes demandent vos identifiants : elles ne peuvent pas être faites à votre place.

1. **Compte Cloudflare** : créer un compte gratuit sur <https://dash.cloudflare.com/sign-up>.
2. **Identifiant du compte** : dans le tableau de bord, section *Workers & Pages*, copier l'*Account ID*
   (colonne de droite).
3. **Jeton d'API** : *My Profile* → *API Tokens* → *Create Token* → *Create Custom Token*, avec une seule
   permission : *Account* → *Cloudflare Pages* → *Edit*, limitée à votre compte. Copier le jeton (il ne
   s'affiche qu'une fois).
4. **Secrets GitHub** : dans le dépôt, *Settings* → *Secrets and variables* → *Actions* →
   *New repository secret*, deux fois :
   - `CLOUDFLARE_API_TOKEN` : le jeton de l'étape 3 ;
   - `CLOUDFLARE_ACCOUNT_ID` : l'identifiant de l'étape 2.
5. **Première publication** : onglet *Actions* → *Publier* → *Run workflow*. La première exécution crée le
   projet Pages `atlas-electoral` ; le site est alors servi à l'adresse `https://atlas-electoral.pages.dev`
   (Cloudflare ajoute un suffixe si le nom est déjà pris : l'adresse exacte s'affiche à la fin du journal).

## En-têtes HTTP et sécurité

Les en-têtes sont dans `app/public/_headers`, copié tel quel dans le site :
- **politique de sécurité (CSP)** : scripts, styles et polices du site seulement ; connexions permises vers
  le site, le PMTiles officiel des bureaux (stockage OVH de data.gouv) et `geo.api.gouv.fr`. Tout nouveau
  service appelé par le navigateur doit y être ajouté, sinon il sera bloqué ;
- `frame-ancestors 'none'` : le site ne peut pas être intégré dans une page tierce (à rouvrir si l'on
  propose des cartes à intégrer) ;
- cache : un an pour `/assets/*` (noms tirés du contenu), revalidation à chaque visite pour `/data/*`.

Vérification en local, avec les mêmes en-têtes qu'en ligne :

```bash
cd app && npm run build && npm run preview   # http://localhost:4173, données lues dans ../publication
```

## Avant d'ouvrir la bêta au public

Voir la revue des exigences P0 (plan, § 12) : ce qui manque encore y est listé.
