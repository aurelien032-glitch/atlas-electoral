import { LIBELLE_BLOC } from '../carte/couleurs'
import type { Candidature } from './types'

// Particules qui restent en minuscules à l'intérieur d'un nom (« Giscard d'Estaing »).
const PARTICULES = new Set(['de', 'du', 'des', "d'", 'la'])

/**
 * Nom de famille en capitales (convention du ministère) remis en casse d'usage : « LE PEN » → « Le Pen »,
 * « DUPONT-AIGNAN » → « Dupont-Aignan ». Un nom déjà en casse mixte est gardé tel quel.
 */
export function nomPropre(nom: string): string {
  if (nom !== nom.toLocaleUpperCase('fr-FR')) return nom
  return nom
    .toLocaleLowerCase('fr-FR')
    .split(/(?<=[\s'’-])/)
    .map((morceau, i) => (i > 0 && PARTICULES.has(morceau.trim()) ? morceau : morceau.charAt(0).toLocaleUpperCase('fr-FR') + morceau.slice(1)))
    .join('')
}

/**
 * Nom affiché d'une candidature : la liste si c'en est une, sinon le candidat (prénom et nom en casse
 * d'usage : les données de 2002 écrivent « JACQUES CHIRAC »). Les listes sans nom (européennes 1999)
 * sont désignées par leur nuance.
 */
export function nomCandidature(c: Candidature): string {
  const personne = [c.prenom && nomPropre(c.prenom), c.nom && nomPropre(c.nom)].filter(Boolean).join(' ')
  return c.liste_abregee ?? c.liste ?? (personne || `Liste ${c.nuance}${c.panneau ? ` (panneau ${c.panneau})` : ''}`)
}

/**
 * Nuance officielle et bloc d'une candidature, sur une ligne : « RN · extrême droite ». La nuance
 * attribuée par le projet (candidat sans nuance du ministère) est signalée comme telle.
 */
export const nuanceCourte = (c: Candidature) =>
  `${c.nuance}${c.origine_nuance === 'attribuée' ? ' (attribuée)' : ''} · ${LIBELLE_BLOC[c.bloc].toLowerCase()}`
