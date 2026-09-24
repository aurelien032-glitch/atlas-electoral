import { describe, expect, it } from 'vitest'
import { grouper, scrutinParDefaut, scrutinPrecedent } from './scrutins'
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
    expect(scrutinPrecedent(catalogue, catalogue[0])?.id).toBe('2017_legi_t1')
  })

  it('groupe par type, du plus récent au plus ancien', () => {
    expect(grouper(catalogue).map((g) => [g.code, g.scrutins.map((x) => x.id)])).toEqual([
      ['pres', ['2022_pres_t2', '2022_pres_t1', '2017_pres_t1']],
      ['legi', ['2017_legi_t1']],
      ['euro', ['2024_euro_t1', '2019_euro_t1']],
    ])
  })
})
