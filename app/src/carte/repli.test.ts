import { describe, expect, it } from 'vitest'
import type { Bureau, BureauContour } from '../donnees/types'
import { repli, territoiresDesContours, territoiresSansDessin } from './repli'

const resultat = { inscrits: 0, votants: 0, blancs: 0, nuls: 0, exprimes: 0, tete: null, egalite: false, avance_x10000: null }
const bureau = (code_bv: string, inscrits: number): Bureau => ({ ...resultat, code_bv, inscrits })
const contour = (code_bv: string): BureauContour => ({ code_bv, code_commune: code_bv.split('_')[0], code_circonscription: null })

const contours = territoiresDesContours(['10001_0001', '10001_0002', '33063_1101', '33063_1102', '75056_0101'].map(contour))
const territoires = ['10001', '10387', '33063', '75056'].map((code) => ({ niveau: 'commune', code }))
  .concat(['75101', '75102'].map((code) => ({ niveau: 'arrondissement', code })), [{ niveau: 'departement', code: '10' }])
const sansDessin = territoiresSansDessin(contours, territoires)
const communeDu = (code: string) => code.split('_')[0]

describe('repli à la commune', () => {
  it("rattache un contour de Paris, Lyon ou Marseille à son arrondissement, les autres à leur commune", () => {
    expect(contours.get('75056_0101')).toBe('75101')
    expect(contours.get('10001_0002')).toBe('10001')
  })

  it("dessine par leur commune les territoires qui n'ont aucun contour, jamais une ville découpée en arrondissements", () => {
    expect([...sansDessin]).toEqual(['10387', '75102'])
  })

  it('compte les bureaux sans contour de chaque territoire', () => {
    const r = repli(contours, sansDessin, [bureau('10001_0001', 100), bureau('10001_0003', 50), bureau('75056_0101', 200)], communeDu)
    expect(r.sansContour.get('10001')).toEqual({ bureaux: 1, inscrits: 50, bureauxTotal: 2, inscritsTotal: 150 })
    expect(r.sansContour.has('75101')).toBe(false)
    expect(r.aLaCommune.size).toBe(0)
  })

  it('montre en entier un territoire dont la plupart des inscrits votent dans un bureau sans contour', () => {
    const r = repli(contours, sansDessin, [bureau('33063_1001', 400), bureau('33063_1101', 100), bureau('10387_0001', 300)], communeDu)
    expect([...r.aLaCommune].sort()).toEqual(['10387', '33063'])
  })

  it("n'a rien à compter sans les bureaux : la carte s'arrête alors à la commune", () => {
    const r = repli(contours, sansDessin, null, communeDu)
    expect(r.sansContour.size).toBe(0)
    expect(r.aLaCommune.size).toBe(0)
  })
})
