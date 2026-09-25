import { describe, expect, it } from 'vitest'
import {
  grouper, plusieursElections, raisonPlusieursElections, scrutinParDefaut, scrutinPrecedent, scrutinsAnterieurs,
} from './scrutins'
import type { ScrutinCatalogue } from './types'

const s = (id: string, date: string) => ({ id, date, libelle: id, portee: 'national' }) as ScrutinCatalogue
const catalogue = [
  s('2017_pres_t1', '2017-04-23'), s('2017_legi_t1', '2017-06-11'), s('2019_euro_t1', '2019-05-26'),
  s('2022_pres_t1', '2022-04-10'), s('2022_pres_t2', '2022-04-24'), s('2024_euro_t1', '2024-06-09'),
]

describe('scrutins', () => {
  it('affiche par défaut le premier tour de la dernière présidentielle', () => {
    expect(scrutinParDefaut(catalogue)?.id).toBe('2022_pres_t1')
  })

  it('compare par défaut au scrutin précédent du même type et du même tour', () => {
    expect(scrutinPrecedent(catalogue, catalogue[3])?.id).toBe('2017_pres_t1')
    expect(scrutinPrecedent(catalogue, catalogue[5])?.id).toBe('2019_euro_t1')
    expect(scrutinPrecedent(catalogue, catalogue[1])?.id).toBe('2017_pres_t1')
  })

  it('ne propose jamais un départ postérieur à l’arrivée', () => {
    expect(scrutinPrecedent(catalogue, catalogue[0])).toBeUndefined()
    expect(scrutinsAnterieurs(catalogue, catalogue[0])).toEqual([])
    expect(scrutinsAnterieurs(catalogue, catalogue[3]).map((x) => x.id)).toEqual(['2017_pres_t1', '2017_legi_t1', '2019_euro_t1'])
    // Deux scrutins le même jour (régionales et départementales de 2021) se comparent.
    const regi = s('2021_regi_t1', '2021-06-20')
    const dpmt = s('2021_dpmt_t1', '2021-06-20')
    expect(scrutinsAnterieurs([regi, dpmt], regi).map((x) => x.id)).toEqual(['2021_dpmt_t1'])
    expect(scrutinPrecedent([regi, dpmt], regi)?.id).toBe('2021_dpmt_t1')
  })

  it('groupe par type, du plus récent au plus ancien', () => {
    expect(grouper(catalogue).map((g) => [g.code, g.scrutins.map((x) => x.id)])).toEqual([
      ['pres', ['2022_pres_t2', '2022_pres_t1', '2017_pres_t1']],
      ['legi', ['2017_legi_t1']],
      ['euro', ['2024_euro_t1', '2019_euro_t1']],
    ])
  })
})

describe('plusieurs élections dans un territoire', () => {
  const muni2020 = s('2020_muni_t1', '2020-03-15')
  const legi2024 = s('2024_legi_t1', '2024-06-30')

  it('reconnaît le vote par secteur de Paris, Lyon et Marseille, même sans l’indicateur du pipeline', () => {
    expect(plusieursElections(muni2020, 'commune', '13055')).toBe(true)
    expect(plusieursElections(s('2026_muni_t1', '2026-03-15'), 'commune', '13055')).toBe(false)
  })

  it('suit l’indicateur des agrégats ailleurs', () => {
    expect(plusieursElections(legi2024, 'commune', '31555', { plusieurs_elections: true })).toBe(true)
    expect(plusieursElections(legi2024, 'commune', '31555', { plusieurs_elections: false })).toBe(false)
    expect(plusieursElections(legi2024, 'commune', '31555', { exprimes: 10 })).toBe(false)
    expect(raisonPlusieursElections(legi2024)).toBe('plusieurs circonscriptions')
  })
})
