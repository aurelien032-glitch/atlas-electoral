import { describe, expect, it } from 'vitest'
import { formatEcart, pourLaVoix, unitePoints } from './format'

describe('infobulle lue par un lecteur d’écran', () => {
  it('écrit « points » en toutes lettres et remplace le point médian', () => {
    expect(pourLaVoix('Extrême droite · avance nette, 13,4 pts')).toBe('Extrême droite, avance nette, 13,4 points')
    expect(pourLaVoix('Avance serrée, 1,5 pts')).toBe('Avance serrée, 1,5 point')
    expect(pourLaVoix('En tête : Marine Le Pen')).toBe('En tête : Marine Le Pen')
  })
})

describe('écarts en points', () => {
  it('signe les écarts avec un vrai signe moins', () => {
    expect([2.46, -0.44, 0.04].map((x) => formatEcart(x))).toEqual(['+2,5', '−0,4', '0,0'])
  })

  it('accorde « point » au pluriel à partir de 2, après arrondi', () => {
    expect([1.1, 1.94, 1.96, -3, 0].map((x) => unitePoints(x))).toEqual(['point', 'point', 'points', 'points', 'point'])
  })
})
