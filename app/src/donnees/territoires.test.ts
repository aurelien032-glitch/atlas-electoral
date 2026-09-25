import { describe, expect, it } from 'vitest'
import { arrondissementDu, estArrondissement, titreDe, villeDe } from './territoires'

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
