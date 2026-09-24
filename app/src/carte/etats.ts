import { classeDe } from '../calculs/classes'
import type { Mesure } from '../calculs/parts'
import type { Bloc, Resultat } from '../donnees/types'
import { COULEUR_BLOC, FOND_CARTE, GRIS, estColore, palier } from './couleurs'

/**
 * État MapLibre (feature-state) d'un territoire. Sans état, un territoire n'est pas peint : il reste
 * « sans résultat ». Les hachures signalent une valeur qui n'a pas de sens (pas de candidat du bloc,
 * territoire non comparable).
 */
export interface Etat {
  couleur: string
  opacite: number
  hachure: boolean
}

const HACHURE: Etat = { couleur: FOND_CARTE, opacite: 1, hachure: false }

/**
 * Couleur d'un territoire sur la carte « Tête » : le bloc de la candidature en tête, plus ou moins
 * intense selon son avance. Les égalités et les gris ne sont pas nuancés. Renvoie null quand il n'y a
 * aucun suffrage exprimé : le territoire reste alors « sans résultat ».
 */
export function etatTete(resultat: Resultat, blocDe: (cand: number) => Bloc): Etat | null {
  if (resultat.tete === null || resultat.exprimes === 0) return null
  if (resultat.egalite) return { couleur: GRIS.egalite, opacite: 1, hachure: false }
  const bloc = blocDe(resultat.tete)
  if (estColore(bloc)) return { couleur: COULEUR_BLOC[bloc], opacite: palier(resultat.avance_x10000 ?? 0).opacite, hachure: false }
  return { couleur: bloc === 'DIV' ? GRIS.divers : GRIS.nonClasse, opacite: 1, hachure: false }
}

/**
 * Couleur d'un territoire sur une carte en classes (score, participation, évolution) : la couleur de
 * sa classe, ou des hachures quand la valeur n'a pas de sens. Valeur et seuils dans la même unité.
 */
export function etatClasse(valeur: Mesure, seuils: readonly number[], couleurs: readonly string[]): Etat {
  if (valeur === null) return { ...HACHURE, hachure: true }
  return { couleur: couleurs[classeDe(valeur, seuils)], opacite: 1, hachure: false }
}
