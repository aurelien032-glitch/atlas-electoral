import { describe, expect, it } from 'vitest'
import type { ScrutinCatalogue } from './donnees/types'
import { SITE, adresseCanonique, descriptionDe } from './referencement'

const scrutin = (id: string, libelle: string, date: string, niveau: 'bureau' | 'commune'): ScrutinCatalogue => ({
  id, libelle, date, portee: 'national',
  totaux: { inscrits: 1, votants: 1, blancs: 0, nuls: 0, exprimes: 1 },
  jointure_contours: { millesime_contours: 2022, taux_inscrits_metropole: 1, niveau_carte: niveau },
})

const catalogue = [
  scrutin('2017_pres_t1', 'Présidentielle 2017, 1er tour', '2017-04-23', 'commune'),
  scrutin('2022_pres_t1', 'Présidentielle 2022, 1er tour', '2022-04-10', 'bureau'),
  scrutin('2024_legi_t1', 'Législatives 2024, 1er tour', '2024-06-30', 'bureau'),
]
const [ancien, defaut, legislatives] = catalogue

describe('adresse canonique', () => {
  it('rattache le scrutin par défaut à l\'accueil, dit ou non dans l\'adresse', () => {
    expect(adresseCanonique(undefined, defaut, catalogue)).toBe(`${SITE}/`)
  })
  it('donne aux autres scrutins leur vue nationale', () => {
    expect(adresseCanonique(undefined, legislatives, catalogue)).toBe(`${SITE}/?scrutin=2024_legi_t1`)
    expect(adresseCanonique(undefined, ancien, catalogue)).toBe(`${SITE}/?scrutin=2017_pres_t1`)
  })
  it('garde la page Méthodologie, quel que soit le scrutin', () => {
    expect(adresseCanonique('methodologie', legislatives, catalogue)).toBe(`${SITE}/?page=methodologie`)
    expect(adresseCanonique('methodologie', undefined, [])).toBe(`${SITE}/?page=methodologie`)
  })
  it('n\'en pose aucune tant que le catalogue n\'est pas chargé', () => {
    expect(adresseCanonique(undefined, undefined, [])).toBeUndefined()
  })
})

describe('description de la vue', () => {
  it('laisse à l\'accueil la description d\'index.html', () => {
    expect(descriptionDe(undefined, defaut, catalogue)).toBeUndefined()
    expect(descriptionDe(undefined, undefined, [])).toBeUndefined()
  })
  it('cite le scrutin, sa date et le niveau de la carte', () => {
    expect(descriptionDe(undefined, legislatives, catalogue))
      .toBe('Législatives 2024, 1er tour (30 juin 2024) : résultats officiels, de la France entière à la commune et au bureau de vote. Participation, voix et parts de chaque candidature.')
    expect(descriptionDe(undefined, ancien, catalogue)).toContain('(23 avril 2017) : résultats officiels, de la France entière à la commune.')
  })
  it('décrit la Méthodologie', () => {
    expect(descriptionDe('methodologie', legislatives, catalogue)).toMatch(/^Méthodologie de l'Atlas électoral/)
  })
})
