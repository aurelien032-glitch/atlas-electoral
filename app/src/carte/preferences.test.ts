import { describe, expect, it } from 'vitest'
import { OPACITE_SUR_PLAN } from './couleurs'
import { lireOpacite } from './preferences'

describe('opacité des couleurs gardée par le navigateur', () => {
  it('relit une valeur valide, arrondie au pas du curseur', () => {
    expect(lireOpacite('0.4')).toBe(0.4)
    expect(lireOpacite('1')).toBe(1)
    expect(lireOpacite('0.1')).toBe(0.1)
    expect(lireOpacite('0.34')).toBe(0.3)
  })

  it('revient à 70 % pour une valeur absente ou hors du curseur', () => {
    expect(lireOpacite(null)).toBe(OPACITE_SUR_PLAN)
    expect(lireOpacite('')).toBe(OPACITE_SUR_PLAN)
    expect(lireOpacite('0')).toBe(OPACITE_SUR_PLAN)
    expect(lireOpacite('1.5')).toBe(OPACITE_SUR_PLAN)
    expect(lireOpacite('abc')).toBe(OPACITE_SUR_PLAN)
  })
})
