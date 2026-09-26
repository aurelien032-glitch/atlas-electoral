import { describe, expect, it } from 'vitest'
import {
  arrondissementDu, estArrondissement, lesArrondissements, secteurDe, selectionDeCommune, titreDe, villeDe,
} from './territoires'

describe('territoire d’une adresse', () => {
  it('choisit l’arrondissement à Paris, Lyon et Marseille, la commune ailleurs', () => {
    expect(selectionDeCommune('75102')).toEqual({ niveau: 'arrondissement', code: '75102' })
    expect(selectionDeCommune('69382')).toEqual({ niveau: 'arrondissement', code: '69382' })
    expect(selectionDeCommune('80021')).toEqual({ niveau: 'commune', code: '80021' })
  })
})

describe('titre d’un territoire choisi', () => {
  const index = { noms: new Map([['69', 'Rhône'], ['69123', 'Lyon'], ['69-02', 'Rhône, 2e circonscription']]), passage: new Map() }

  it('nomme communes, bureaux et circonscriptions', () => {
    expect(titreDe({ niveau: 'commune', code: '69123' }, index)).toBe('Lyon')
    expect(titreDe({ niveau: 'bureau', code: '69123_0816' }, index)).toBe('Lyon, bureau 0816')
    expect(titreDe({ niveau: 'circonscription', code: '69-02' }, index)).toBe('Rhône, 2e circonscription')
  })

  it('nomme une circonscription absente de l’index (scrutin qui n’est pas une législative)', () => {
    expect(titreDe({ niveau: 'circonscription', code: '69-01' }, index)).toBe('Rhône, 1re circonscription')
    expect(titreDe({ niveau: 'circonscription', code: '69-14' }, index)).toBe('Rhône, 14e circonscription')
  })
})

describe('arrondissements de Paris, Lyon et Marseille', () => {
  it("lit l'arrondissement dans le numéro de bureau", () => {
    expect(['75056_1512', '75056_0101', '69123_0305', '13055_1604'].map(arrondissementDu))
      .toEqual(['75115', '75101', '69383', '13216'])
  })

  it('laisse à la ville les bureaux hors de la règle, et ignore les autres communes', () => {
    expect(['69123_0001', '75056_JU01', '75056_2101', '13055_1701', '01001_0001'].map(arrondissementDu))
      .toEqual([undefined, undefined, undefined, undefined, undefined])
  })

  it('reconnaît les codes des arrondissements et leur ville', () => {
    expect(['75101', '75120', '69389', '13216', '75056', '69380'].map(estArrondissement))
      .toEqual([true, true, true, true, false, false])
    expect(['75115', '69383', '13216'].map(villeDe)).toEqual(['75056', '69123', '13055'])
  })
})

describe('secteurs des municipales', () => {
  it('réunit deux arrondissements par secteur à Marseille, numérotés dans l’ordre officiel', () => {
    expect(secteurDe('13207', 2014)).toEqual({ nom: '1er secteur', arrondissements: ['13201', '13207'] })
    expect(secteurDe('13208', 2008)?.nom).toBe('4e secteur')
    expect(secteurDe('13216', 2020)?.nom).toBe('8e secteur')
  })

  it('ne réunit les quatre premiers arrondissements de Paris qu’en 2020, jamais ceux de Lyon', () => {
    expect(secteurDe('75103', 2020)?.nom).toBe('Paris Centre')
    expect(secteurDe('75103', 2014)).toBeUndefined()
    expect(secteurDe('75105', 2020)).toBeUndefined()
    expect(secteurDe('69381', 2020)).toBeUndefined()
  })

  it('n’existe plus en 2026, où chaque ville vote pour une seule liste', () => {
    expect(secteurDe('13201', 2026)).toBeUndefined()
  })

  it('nomme les arrondissements d’un secteur', () => {
    expect(lesArrondissements(['13201', '13207'])).toBe('les 1er et 7e arrondissements')
    expect(lesArrondissements(['75101', '75102', '75103', '75104'])).toBe('les 1er, 2e, 3e et 4e arrondissements')
  })
})
