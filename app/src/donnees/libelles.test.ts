import { describe, expect, it } from 'vitest'
import { nomCandidature, nomPropre } from './libelles'
import type { Candidature } from './types'

describe('nomPropre', () => {
  it('remet les noms en capitales dans la casse d’usage', () => {
    expect(['LE PEN', 'DUPONT-AIGNAN', 'MÉLENCHON', "GISCARD D'ESTAING", 'Macron'].map(nomPropre))
      .toEqual(['Le Pen', 'Dupont-Aignan', 'Mélenchon', "Giscard d'Estaing", 'Macron'])
  })
})

describe('nomCandidature', () => {
  const c = (champs: Partial<Candidature>) => ({ prenom: null, nom: null, liste: null, liste_abregee: null, nuance: 'DIV', panneau: null, ...champs }) as Candidature

  it('lie les noms composés par un trait d’union insécable, pas les listes', () => {
    expect(nomCandidature(c({ prenom: 'JEAN-LUC', nom: 'MÉLENCHON' }))).toBe('Jean‑Luc Mélenchon')
    expect(nomCandidature(c({ liste_abregee: 'PS-PP' }))).toBe('PS-PP')
  })
})
