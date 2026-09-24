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

/** Nom affiché d'une candidature : la liste si c'en est une, sinon le candidat. */
export function nomCandidature(c: Candidature): string {
  const nom = c.nom ? nomPropre(c.nom) : null
  return c.liste_abregee ?? c.liste ?? ([c.prenom, nom].filter(Boolean).join(' ') || `Candidature ${c.panneau ?? ''}`)
}
