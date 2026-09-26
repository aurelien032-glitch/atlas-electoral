import { describe, expect, it } from 'vitest'
import type { Bureau, BureauContour, SourceCorrectif } from '../donnees/types'
import { repli, territoiresDesContours, territoiresDesCorrectifs, territoiresDesSources, territoiresSansDessin } from './repli'

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

  it('dessine un territoire par son découpage local quand il porte les numéros du scrutin', () => {
    const correctifs = territoiresDesCorrectifs(['33063_1001', '33063_1021'])
    const bureaux2024 = [bureau('33063_1001', 400), bureau('33063_1021', 100)]
    const r2024 = repli(contours, sansDessin, bureaux2024, communeDu, correctifs)
    expect([...r2024.corriges]).toEqual(['33063'])
    expect(r2024.aLaCommune.has('33063')).toBe(false)
    expect(r2024.sansContour.has('33063')).toBe(false)
    // En 2022, les numéros sont ceux des contours d'Etalab : le découpage local ne sert pas.
    const r2022 = repli(contours, sansDessin, [bureau('33063_1101', 300), bureau('33063_1102', 200)], communeDu, correctifs)
    expect(r2022.corriges.size).toBe(0)
  })

  it("n'emploie pas un découpage local avant son année, même si les numéros concordent", () => {
    // Paris Centre : découpage employé depuis 2024 ; le 1er arrondissement y a gardé ses numéros de 2022.
    const paris: SourceCorrectif = {
      territoires: ['75101', '75102'], remplace: [], nom: 'Ville de Paris', titre: 'découpage de 2026', annee: 2026,
      depuis: 2024, fiche: '', licence: 'Licence Ouverte', modifie: null, bureaux: 2,
    }
    const correctifs = territoiresDesCorrectifs(['75056_0101', '75056_0211'])
    const bureaux = [bureau('75056_0101', 500), bureau('75056_0211', 500)]
    expect(repli(contours, sansDessin, bureaux.slice(0, 1), communeDu, correctifs, territoiresDesSources([paris], 2022)).corriges.size).toBe(0)
    expect([...repli(contours, sansDessin, bureaux, communeDu, correctifs, territoiresDesSources([paris], 2024)).corriges].sort())
      .toEqual(['75101', '75102'])
  })

  it('remplace à tout scrutin des contours de 2022 faux, même sur une carte à la commune', () => {
    // Le contour de 2022 du bureau 0001 de 10001 déborde sur une ville voisine : son découpage local le remplace.
    const correctifs = territoiresDesCorrectifs(['10001_0001', '10001_0002'])
    const remplaces = new Set(['10001'])
    expect([...repli(contours, sansDessin, null, communeDu, correctifs, new Set(), remplaces).corriges]).toEqual(['10001'])
    // À la commune, un territoire sans aucun contour garde son contour détaillé, même avec un découpage local.
    const avecSansDessin = territoiresDesCorrectifs(['10001_0001', '10387_0001'])
    expect([...repli(contours, sansDessin, null, communeDu, avecSansDessin, new Set(), remplaces).corriges]).toEqual(['10001'])
    // Au bureau, même quand ses numéros ne suivent plus : ceux qui manquent sont comptés sans être dessinés.
    const r = repli(contours, sansDessin, [bureau('10001_0001', 100), bureau('10001_0009', 300)], communeDu, correctifs, new Set(), remplaces)
    expect([...r.corriges]).toEqual(['10001'])
    expect(r.sansContour.get('10001')).toEqual({ bureaux: 1, inscrits: 300, bureauxTotal: 2, inscritsTotal: 400 })
    expect(r.aLaCommune.has('10001')).toBe(true)
  })

  it("n'a rien à compter sans les bureaux : la carte s'arrête alors à la commune", () => {
    const r = repli(contours, sansDessin, null, communeDu)
    expect(r.sansContour.size).toBe(0)
    expect(r.aLaCommune.size).toBe(0)
  })
})
