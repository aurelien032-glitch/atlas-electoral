import { describe, expect, it } from 'vitest'
import { ecrireCadre, lireCadre, lireVue } from './vue'

describe('état de la vue dans l’URL', () => {
  it('lit le territoire choisi et ignore un niveau inconnu', () => {
    expect(lireVue(new URLSearchParams('sel=commune:69123')).selection).toEqual({ niveau: 'commune', code: '69123' })
    expect(lireVue(new URLSearchParams('sel=canton:6901')).selection).toBeUndefined()
  })
})

describe('cadrage de la carte dans le fragment', () => {
  it('écrit zoom, latitude et longitude à une précision qui suit le zoom', () => {
    expect(ecrireCadre({ zoom: 5.3457, centre: [2.2, 46.2] })).toBe('#5.35/46.2/2.2')
    expect(ecrireCadre({ zoom: 11.2, centre: [4.83567, 45.76412] })).toBe('#11.2/45.7641/4.8357')
  })

  it('relit ce qu’il écrit', () => {
    const cadre = lireCadre(ecrireCadre({ zoom: 13.456, centre: [-1.5534, 47.2184] }))
    expect(cadre?.zoom).toBe(13.46)
    expect(cadre?.centre[0]).toBeCloseTo(-1.5534, 4)
    expect(cadre?.centre[1]).toBeCloseTo(47.2184, 4)
  })

  it('refuse un fragment qui n’est pas un cadrage', () => {
    expect(lireCadre('')).toBeNull()
    expect(lireCadre('#methodologie')).toBeNull()
    expect(lireCadre('#5/100/2')).toBeNull()
    expect(lireCadre('#11/45.76/4.83/30')).toBeNull()
  })
})
