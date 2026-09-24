import type { Bloc, Resultat } from '../donnees/types'
import { BLOCS_COLORES, COULEUR_BLOC, GRIS, estColore, palier } from './couleurs'

/** Catégories de la carte « Tête », dans l'ordre de l'expression de couleur MapLibre. */
export const CATEGORIES = [...BLOCS_COLORES, 'DIV', 'NC', 'EGALITE'] as const
export type Categorie = (typeof CATEGORIES)[number]

export const COULEUR_CATEGORIE: Record<Categorie, string> = {
  ...COULEUR_BLOC,
  DIV: GRIS.divers,
  NC: GRIS.nonClasse,
  EGALITE: GRIS.egalite,
}

/** État MapLibre (feature-state) d'un territoire : catégorie de couleur et opacité. */
export interface Etat {
  categorie: number
  opacite: number
}

/**
 * Couleur d'un territoire sur la carte « Tête » : le bloc de la candidature en tête, plus ou moins
 * intense selon son avance. Les égalités et les gris ne sont pas nuancés. Renvoie null quand il n'y a
 * aucun suffrage exprimé : le territoire reste alors « sans résultat ».
 */
export function etatTerritoire(resultat: Resultat, blocDe: (cand: number) => Bloc): Etat | null {
  if (resultat.tete === null || resultat.exprimes === 0) return null
  if (resultat.egalite) return { categorie: CATEGORIES.indexOf('EGALITE'), opacite: 1 }
  const bloc = blocDe(resultat.tete)
  return {
    categorie: CATEGORIES.indexOf(bloc),
    opacite: estColore(bloc) ? palier(resultat.avance_x10000 ?? 0).opacite : 1,
  }
}

/** Paires (index de catégorie, couleur) pour l'expression MapLibre 'match'. */
export const COULEURS_PAR_INDEX: (number | string)[] = CATEGORIES.flatMap((c, i) => [i, COULEUR_CATEGORIE[c]])
