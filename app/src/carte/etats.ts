import { classeDe } from '../calculs/classes'
import type { Mesure } from '../calculs/parts'
import type { Bloc, Resultat } from '../donnees/types'
import { COULEUR_BLOC, FOND_CARTE, GRIS, estColore } from './couleurs'

/**
 * État MapLibre (feature-state) d'un territoire. Sans état, un territoire n'est pas peint : il reste
 * « sans résultat ». Les hachures signalent une valeur qui n'a pas de sens (pas de candidat du bloc,
 * territoire non comparable).
 */
export interface Etat {
  couleur: string
  opacite: number
  hachure: boolean
  /** Contour de bureau peint à la couleur de sa commune, faute de bureau de ce scrutin : son tracé s'efface. */
  commune?: boolean
  /** Commune dessinée bureau par bureau par son découpage local : au zoom des bureaux, elle n'est pas peinte dessous. */
  locale?: boolean
}

const HACHURE: Etat = { couleur: FOND_CARTE, opacite: 1, hachure: false }

/**
 * Couleur d'un territoire sur la carte « Tête » : le bloc de la candidature en tête, plus ou moins
 * intense selon son avance. Les égalités et les gris ne sont pas nuancés. Renvoie null quand il n'y a
 * aucun suffrage exprimé : le territoire reste alors « sans résultat ».
 */
export function etatTete(
  resultat: Resultat & { bloc_en_tete?: Bloc | null; egalite_bloc?: boolean | null; avance_bloc_x10000?: number | null },
  blocDe: (cand: number) => Bloc,
): Etat | null {
  if (resultat.exprimes === 0) return null
  // Territoire qui réunit plusieurs élections (cantons, circonscriptions…) : le bloc qui totalise le plus de
  // voix, ses candidatures ne s'affrontant pas toutes (décision Q16).
  if (resultat.bloc_en_tete) {
    if (resultat.egalite_bloc) return EGALITE
    return etatDuBloc(resultat.bloc_en_tete)
  }
  if (resultat.tete === null) return null
  if (resultat.egalite) return EGALITE
  return etatDuBloc(blocDe(resultat.tete))
}

// Couleurs pleines : l'avance se lit dans l'infobulle et la fiche, pas dans l'intensité (décision du 25/09). Un état
// par bloc, partagé par tous ses territoires (70 000 bureaux : autant d'objets de moins à chaque coloriage) ; les
// états ne sont jamais modifiés, seulement recopiés.
const PAR_BLOC = new Map<Bloc, Etat>()
function etatDuBloc(bloc: Bloc): Etat {
  let etat = PAR_BLOC.get(bloc)
  if (!etat) {
    etat = { couleur: estColore(bloc) ? COULEUR_BLOC[bloc] : bloc === 'DIV' ? GRIS.divers : GRIS.nonClasse, opacite: 1, hachure: false }
    PAR_BLOC.set(bloc, etat)
  }
  return etat
}
const EGALITE: Etat = { couleur: GRIS.egalite, opacite: 1, hachure: false }

/**
 * Couleur d'un territoire sur une carte en classes (score, participation, évolution) : la couleur de
 * sa classe, ou des hachures quand la valeur n'a pas de sens. Valeur et seuils dans la même unité.
 */
export function etatClasse(valeur: Mesure, seuils: readonly number[], couleurs: readonly string[]): Etat {
  if (valeur === null) return { ...HACHURE, hachure: true }
  return { couleur: couleurs[classeDe(valeur, seuils)], opacite: 1, hachure: false }
}
