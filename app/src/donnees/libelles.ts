import type { Candidature } from './types'

/** Nom affiché d'une candidature : la liste si c'en est une, sinon le candidat. */
export function nomCandidature(c: Candidature): string {
  return c.liste_abregee ?? c.liste ?? ([c.prenom, c.nom].filter(Boolean).join(' ') || `Candidature ${c.panneau ?? ''}`)
}
