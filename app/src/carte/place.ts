// Mise en page selon l'écran, et place que les éléments posés sur la carte laissent à la métropole (décision du
// 26/09 : la carte fait de la place à ce qui est déplié plutôt que de passer dessous).

/**
 * Volet en bas (téléphone, tablette tenue verticalement) plutôt que panneau à gauche. Même requête que les
 * `@media` de styles.css.
 */
export const REQUETE_VOLET = '(width < 761px), (width < 1024px) and (orientation: portrait)'
export const enVolet = () => window.matchMedia(REQUETE_VOLET).matches

/** Métropole et Corse : [ouest, sud, est, nord]. */
export const FRANCE_METROPOLITAINE: [number, number, number, number] = [-5.2, 41.3, 9.6, 51.1]

export const estFrance = (emprise: readonly number[]) => emprise.every((v, i) => v === FRANCE_METROPOLITAINE[i])

/** Ce qui est déplié sur la carte ou par-dessus. */
export interface Place {
  legendeRepliee: boolean
  /** Encarts dépliés : ils élargissent la colonne de droite (vue d'ensemble seulement). */
  encartsDeplies: boolean
  /** Volet réduit à sa barre (téléphone) : la carte a presque tout l'écran. */
  voletReplie: boolean
}

/** La carte à l'écran : sa taille, et la mise en page (volet en bas ou panneau à gauche). */
export interface Ecran {
  largeur: number
  hauteur: number
  volet: boolean
}

export interface Marges {
  top: number
  bottom: number
  left: number
  right: number
}

// Encombrement des éléments posés sur la carte (styles.css), écart compris.
const ONGLETS = 84          // en haut : 24 + 48, et 12
const LEGENDE = 320         // dépliée, à gauche : 24 + 270, et 26
const LEGENDE_REPLIEE = 72  // repliée, une ligne en bas à gauche (24 + 58) : elle peut mordre sur l'Espagne
const SOURCES = 40          // mention des sources, en bas à droite : 10 + 24, et 6
const ZOOM = 72             // colonne du zoom, de l'opacité et du bouton des encarts : 24 + 45, et 3
const ENCARTS = 298         // encarts dépliés : 24 + 258 (barre de défilement comprise), et 16
const VOLET_REPLIE = 73     // barre du volet réduit : poignée, en-tête et bordure
const SOURCES_VOLET = 36    // mention des sources, posée sur le haut du volet
// En deçà, la métropole serait illisible : les encarts, puis la légende, se posent alors sur la carte.
const MINIMUM = 160

/**
 * Marges du cadrage : ce qui est posé sur la carte ne recouvre pas le territoire cadré. Les encarts ne
 * comptent que pour la métropole entière : zoomée sur un territoire, la carte les masque.
 */
export function marges(place: Place, ecran: Ecran, cadre: 'france' | 'territoire'): Marges {
  if (ecran.volet) {
    const volet = place.voletReplie ? VOLET_REPLIE : Math.round(ecran.hauteur * 0.42)
    const m = { top: 72, bottom: volet + SOURCES_VOLET, left: 16, right: 16 }
    if (ecran.hauteur - m.top - m.bottom < MINIMUM) m.bottom = volet
    return m
  }
  const m = {
    top: ONGLETS,
    bottom: place.legendeRepliee ? LEGENDE_REPLIEE : SOURCES,
    left: place.legendeRepliee ? 24 : LEGENDE,
    right: cadre === 'france' && place.encartsDeplies ? ENCARTS : ZOOM,
  }
  if (ecran.largeur - m.left - m.right < MINIMUM) m.right = ZOOM
  if (ecran.largeur - m.left - m.right < MINIMUM) m.left = 24
  return m
}

export const memesMarges = (a: Marges, b: Marges) =>
  a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right

/**
 * Repli au premier passage, selon la largeur de la fenêtre (décision du 26/09) ; ensuite, le choix de chacun est
 * gardé. Sur téléphone et tablette tenue verticalement, la légende est dans le volet : dépliée, elle ne cache rien.
 */
export function repliParDefaut(element: 'legende' | 'encarts', largeur: number, volet: boolean): boolean {
  if (element === 'legende') return !volet && largeur < 1280
  return volet || largeur < 1500
}
