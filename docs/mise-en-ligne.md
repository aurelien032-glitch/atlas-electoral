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
| `Publier` (`.github/workflows/publier.yml`) | à la main (onglet **Actions**, « Run workflow ») | Reconstruit toutes les données depuis les sources officielles (contours, circonscriptions, 56 tours, séries : 15 à 25 min), lance les 636 contrôles, construit le site et le déploie. **Rien n'est déployé si un contrôle échoue.** Le rapport qualité (manifestes et résultat des contrôles) est joint à chaque exécution (artefact `rapport-qualite`) |

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
   Actions) », **valable jusqu'au 26/09/2027** : le renouveler avant (*Renouveler le jeton*), puis mettre à
   jour le secret, sinon « Publier » échouera au déploiement. Le jeton ne s'affiche qu'une fois : le copier
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

## Avant d'ouvrir la bêta au public

Voir la revue des exigences P0 (plan, § 12) : ce qui manque encore y est listé.
