import type { Bloc } from '../donnees/types'

/** Blocs colorés sur la carte, dans l'ordre de la grille du ministère (de gauche à droite). */
export const BLOCS_COLORES = ['EXG', 'GAU', 'CENT', 'DTE', 'EXD'] as const
export type BlocColore = (typeof BLOCS_COLORES)[number]

// Palette validée avec le validateur du skill dataviz (mode clair, toutes paires) : écart minimal de
// 13 pour les daltoniens. L'ambre et le bleu ciel restent sous 3:1 de contraste : la légende et le
// panneau de détail doublent donc toujours la couleur.
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

/** Gris séparés par la clarté, pour tout ce qui n'est pas un bloc coloré. */
export const GRIS = {
  divers: '#8F8F89',
  nonClasse: '#C9C5B9',
  egalite: '#4A4A44',
  sansResultat: '#E4E4DF',
} as const

// Intensité selon l'avance de la tête (décision du 24/09 : serré, net, large). Avec cinq couleurs, le
// plancher validé est 0,8 : à 0,6, l'extrême gauche et la gauche pâlies se confondent (écart de 11,5).
export const PALIERS = [
  { jusqua: 500, opacite: 0.8, libelle: 'serré' }, // moins de 5 points
  { jusqua: 1500, opacite: 0.9, libelle: 'net' }, // de 5 à 15 points
  { jusqua: Infinity, opacite: 1, libelle: 'large' }, // plus de 15 points
] as const

export function palier(avanceX10000: number) {
  return PALIERS.find((p) => avanceX10000 < p.jusqua) ?? PALIERS[PALIERS.length - 1]
}

export function estColore(bloc: Bloc): bloc is BlocColore {
  return (BLOCS_COLORES as readonly Bloc[]).includes(bloc)
}
