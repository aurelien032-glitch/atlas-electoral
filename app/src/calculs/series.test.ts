import { describe, expect, it } from 'vitest'
import type { LigneSerie, ScrutinCatalogue } from '../donnees/types'
import { etiquettesGardees, plafond, pointsDuType, typesCouverts } from './series'

const scrutin = (id: string, date: string) => ({ id, libelle: id, date, portee: 'commune', totaux: {}, jointure_contours: null }) as unknown as ScrutinCatalogue
const SCRUTINS = [
  scrutin('2014_muni_t1', '2014-03-23'), scrutin('2014_muni_t2', '2014-03-30'),
  scrutin('2020_muni_t1', '2020-03-15'), scrutin('2026_muni_t1', '2026-03-15'), scrutin('2022_pres_t1', '2022-04-10'),
]
const ligne = (id: string, exprimesListes: number | null, gauche: number | null): LigneSerie => ({
  code: '01001', scrutin: id, inscrits: 600, votants: 300, exprimes: 280, exprimes_listes: exprimesListes,
  EXG: null, GAU: gauche, CENT: null, DTE: 0, EXD: null, DIV: null, NC: null,
})

describe('séries chronologiques', () => {
  const lignes = [
    ligne('2026_muni_t1', 280, 140), ligne('2014_muni_t2', 280, 200),
    ligne('2014_muni_t1', 280, 70), ligne('2020_muni_t1', null, null), ligne('2022_pres_t1', 280, 28),
  ]

  it("garde les premiers tours d'un type, dans l'ordre des dates", () => {
    expect(pointsDuType(lignes, SCRUTINS, 'muni').map((p) => p.scrutin.id)).toEqual(['2014_muni_t1', '2020_muni_t1', '2026_muni_t1'])
  })

  it('distingue « pas de candidat » (vide) de « aucune voix » (0 %)', () => {
    const [p2014] = pointsDuType(lignes, SCRUTINS, 'muni')
    expect([p2014.parts.GAU, p2014.parts.DTE, p2014.parts.EXD]).toEqual([0.25, 0, null])
  })

  it('ne calcule aucune part là où l’on vote pour des personnes, mais garde la participation', () => {
    const [, p2020] = pointsDuType(lignes, SCRUTINS, 'muni')
    expect([p2020.panachage, p2020.parts.DTE, p2020.participation]).toEqual([true, null, 0.5])
  })

  it('ne propose que les types qui ont deux premiers tours', () => {
    expect(typesCouverts(lignes)).toEqual(['muni'])
  })

  it("arrondit le haut de l'axe à un pas rond", () => {
    expect([plafond(12), plafond(34.2), plafond(71)]).toEqual([{ haut: 15, pas: 5 }, { haut: 40, pas: 10 }, { haut: 80, pas: 20 }])
  })

  it('écarte les années trop serrées sans jamais perdre la dernière', () => {
    expect(etiquettesGardees([0, 20, 40, 80, 100], 34)).toEqual([0, 2, 4])
  })
})
