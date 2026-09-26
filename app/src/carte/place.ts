// Mise en page selon l'écran, et place que les éléments posés sur la carte laissent à la métropole (décision du
// 26/09 : la carte fait de la place à ce qui est déplié plutôt que de passer dessous).

/**
 * Volet en bas (téléphone, tablette tenue verticalement) plutôt que panneau à gauche, que prennent aussi les
 * téléphones tenus à l'horizontale. Même requête que les `@media` de styles.css.
 */
export const REQUETE_VOLET = '(width < 568px), (width < 1024px) and (orientation: portrait)'
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
  /** Retrait des éléments posés sur la carte (`--cadre-carte`) : 24 px, 12 sur un téléphone. */
  retrait: number
}

export interface Marges {
  top: number
  bottom: number
  left: number
  right: number
}

// Encombrement des éléments posés sur la carte (styles.css), écart compris, au-delà du retrait.
const ONGLETS = 48 + 12        // en haut
const LEGENDE = 270 + 26       // dépliée, à gauche
const LEGENDE_REPLIEE = 58 - 10 // repliée, une ligne en bas à gauche : elle peut mordre de 10 px sur l'Espagne
const SOURCES = 40             // mention des sources, en bas à droite : 10 + 24, et 6
const ZOOM = 45 + 3            // colonne du zoom, de l'opacité et du bouton des encarts
const ENCARTS = 258 + 16       // encarts dépliés (barre de défilement comprise)
const VOLET_REPLIE = 73        // barre du volet réduit : poignée, en-tête et bordure
const SOURCES_VOLET = 36       // mention des sources, posée sur le haut du volet
// Dans le volet, la colonne du zoom ne descend pas jusqu'à la Corse : il suffit de dégager la pointe nord de
// l'Alsace (Lauterbourg), plutôt que de réserver toute la colonne (la métropole perdrait 14 % de sa largeur).
const COLONNE_VOLET = 32
// En deçà, la métropole serait illisible : les encarts, puis la légende, se posent alors sur la carte.
const MINIMUM = 160

/**
 * Marges du cadrage : ce qui est posé sur la carte ne recouvre pas le territoire cadré. Les encarts ne
 * comptent que pour la métropole entière (zoomée sur un territoire, la carte les masque), et pas dans le volet,
 * où ils s'ouvrent dans le panneau.
 */
export function marges(place: Place, ecran: Ecran, cadre: 'france' | 'territoire'): Marges {
  if (ecran.volet) {
    const volet = place.voletReplie ? VOLET_REPLIE : Math.round(ecran.hauteur * 0.42)
    const m = { top: ecran.retrait + ONGLETS, bottom: volet + SOURCES_VOLET, left: 16, right: COLONNE_VOLET }
    if (ecran.hauteur - m.top - m.bottom < MINIMUM) m.bottom = volet
    return m
  }
  const r = ecran.retrait
  const m = {
    top: r + ONGLETS,
    bottom: place.legendeRepliee ? r + LEGENDE_REPLIEE : SOURCES,
    left: r + (place.legendeRepliee ? 0 : LEGENDE),
    right: r + (cadre === 'france' && place.encartsDeplies ? ENCARTS : ZOOM),
  }
  if (ecran.largeur - m.left - m.right < MINIMUM) m.right = r + ZOOM
  if (ecran.largeur - m.left - m.right < MINIMUM) m.left = r
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
