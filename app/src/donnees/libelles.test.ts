import { describe, expect, it } from 'vitest'
import { nomPropre } from './libelles'

describe('nomPropre', () => {
  it('remet les noms en capitales dans la casse d’usage', () => {
    expect(['LE PEN', 'DUPONT-AIGNAN', 'MÉLENCHON', "GISCARD D'ESTAING", 'Macron'].map(nomPropre))
      .toEqual(['Le Pen', 'Dupont-Aignan', 'Mélenchon', "Giscard d'Estaing", 'Macron'])
  })
})
