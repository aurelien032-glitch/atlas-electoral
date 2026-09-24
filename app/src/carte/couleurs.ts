import type { Bloc } from '../donnees/types'

/** Blocs colorés sur la carte, dans l'ordre de la grille du ministère (de gauche à droite). */
export const BLOCS_COLORES = ['EXG', 'GAU', 'CENT', 'DTE', 'EXD'] as const
export type BlocColore = (typeof BLOCS_COLORES)[number]

// Toutes les palettes passent le validateur du skill dataviz, sur le fond papier FOND_CARTE.

/** Fond de la carte : un territoire sans résultat n'est pas peint et le laisse voir. */
export const FOND_CARTE = '#F6F4EF'

// Carte « Tête » (mode clair, toutes paires) : écart minimal de 13 pour les daltoniens. L'ambre et
// le bleu ciel restent sous 3:1 de contraste : la légende et le panneau doublent donc la couleur.
export const COULEUR_BLOC: Record<BlocColore, string> = {
  EXG: '#A0283C',
  GAU: '#E0607E',
  CENT: '#D9960A',
  DTE: '#5AA0D0',
  EXD: '#3558A6',
}

export const LIBELLE_BLOC: Record<Bloc, string> = {
  EXG: 'Extrême gauche',
  GAU: 'Gauche',
  CENT: 'Centre',
  DTE: 'Droite',
  EXD: 'Extrême droite',
  DIV: 'Divers',
  NC: 'Non classé',
}

/** Le bloc précédé de son article, pour les titres (« Évolution de la droite »). */
export const DU_BLOC: Record<BlocColore, string> = {
  EXG: "de l'extrême gauche",
  GAU: 'de la gauche',
  CENT: 'du centre',
  DTE: 'de la droite',
  EXD: "de l'extrême droite",
}

/** Gris séparés par la clarté, pour tout ce qui n'est pas un bloc coloré. */
export const GRIS = {
  divers: '#8F8F89',
  nonClasse: '#C9C5B9',
  egalite: '#4A4A44',
} as const

/** Trait des hachures « pas de candidat » et « non comparable » : une texture, lisible sans la couleur. */
export const TRAIT_HACHURES = '#8F8F89'

// Intensité selon l'avance de la tête (décision du 24/09 : serré, net, large). Avec cinq couleurs, le
// plancher validé est 0,8 : à 0,6, l'extrême gauche et la gauche pâlies se confondent (écart de 11,5).
export const PALIERS = [
  { jusqua: 500, opacite: 0.8, libelle: 'serrée' }, // moins de 5 points
  { jusqua: 1500, opacite: 0.9, libelle: 'nette' }, // de 5 à 15 points
  { jusqua: Infinity, opacite: 1, libelle: 'large' }, // plus de 15 points
] as const

export function palier(avanceX10000: number) {
  return PALIERS.find((p) => avanceX10000 < p.jusqua) ?? PALIERS[PALIERS.length - 1]
}

export function estColore(bloc: Bloc): bloc is BlocColore {
  return (BLOCS_COLORES as readonly Bloc[]).includes(bloc)
}

// Mode Score (décision du 24/09 : teinte du bloc) : cinq classes, du plus clair au plus foncé, dans la
// teinte OKLCH du bloc. Validation ordinale : clarté monotone, écart ≥ 0,06 entre classes, classe
// la plus claire à 2:1 au moins sur le fond.
export const RAMPE_SCORE: Record<BlocColore | 'DIV', readonly string[]> = {
  EXG: ['#df989b', '#d16f76', '#be4554', '#9d253a', '#780b25'],
  GAU: ['#df96a3', '#d26c81', '#be4162', '#9e2048', '#790431'],
  CENT: ['#d6a457', '#be840d', '#9b6900', '#785100', '#563902'],
  DTE: ['#8fb3ce', '#6297bd', '#347ba9', '#115f8c', '#024468'],
  EXD: ['#97aedd', '#6f90d1', '#4c71c1', '#3255a2', '#1e3b7d'],
  DIV: ['#afafa6', '#919189', '#75756d', '#5a5a52', '#404039'],
}

/** Participation : une teinte sarcelle, sans lien avec les blocs. Même validation ordinale. */
export const RAMPE_PARTICIPATION = ['#72b7b7', '#3d9f9f', '#048484', '#016767', '#034b4b'] as const

// Mode Évolution (décision du 24/09 : orange ↔ violet, d'après ColorBrewer PuOr) : baisse en orange,
// hausse en violet, centre gris « stable ». Bras monotones ; toutes paires : écart ≥ 13,3 pour les
// daltoniens et ≥ 15,1 en vision normale.
export const SEUILS_EVOLUTION = [-10, -5, -1, 1, 5, 10] as const
export const PALETTE_EVOLUTION = ['#914601', '#cd6a1d', '#efa374', '#dddbd5', '#bda7e5', '#8c6ebc', '#5e388f'] as const
