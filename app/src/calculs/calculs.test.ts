import { describe, expect, it } from 'vitest'
import { classeDe, quantilesPonderes, seuilsLisibles } from './classes'
import { ecartsEnPoints, parts, voixParTerritoire } from './parts'

describe('seuilsLisibles', () => {
  it('découpe en quantiles pondérés arrondis à un pas rond', () => {
    const valeurs = Array.from({ length: 101 }, (_, i) => i)
    expect(seuilsLisibles(valeurs, valeurs.map(() => 1))).toEqual([20, 40, 60, 80])
  })

  it('arrondit à 5 points quand cela ne déforme pas les classes', () => {
    // Cinq groupes d'électeurs de même poids : seuils bruts 14,8 / 20,3 / 25,1 / 30,7.
    expect(seuilsLisibles([10, 14.8, 20.3, 25.1, 30.7], [1, 1, 1, 1, 1])).toEqual([15, 20, 25, 30])
  })

  it('garde des dixièmes pour les petits scores', () => {
    expect(seuilsLisibles([0.2, 0.31, 0.44, 0.58, 0.81], [1, 1, 1, 1, 1])).toEqual([0.3, 0.4, 0.6, 0.8])
  })

  it('pondère par les électeurs : une ville pèse plus que quatre villages', () => {
    expect(seuilsLisibles([10, 20, 30, 40, 50], [1, 1, 1, 1, 1], 2)).toEqual([40])
    expect(seuilsLisibles([10, 20, 30, 40, 50], [100, 1, 1, 1, 1], 2)).toEqual([20])
  })

  it('réduit le nombre de classes plutôt que de laisser une classe vide', () => {
    expect(seuilsLisibles([0, 0, 0, 0, 5], [1, 1, 1, 1, 1])).toEqual([5])
    expect(seuilsLisibles([], [])).toEqual([])
  })
})

/** Ancien calcul, par tri complet : la référence du calcul par histogramme. */
function quantilesParTri(valeurs: number[], poids: number[], classes: number) {
  const ordre = valeurs.map((_, i) => i).filter((i) => poids[i] > 0).sort((a, b) => valeurs[a] - valeurs[b])
  const total = ordre.reduce((somme, i) => somme + poids[i], 0)
  if (total === 0) return null
  const bruts: number[] = []
  let cumul = 0
  let k = 1
  for (const i of ordre) {
    while (k < classes && cumul >= (k * total) / classes) {
      bruts.push(valeurs[i])
      k++
    }
    cumul += poids[i]
  }
  return { bruts, minimum: valeurs[ordre[0]] }
}

describe('quantilesPonderes', () => {
  it('donne exactement les quantiles du tri complet, égalités et poids nuls compris', () => {
    let graine = 42
    const hasard = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let essai = 0; essai < 200; essai++) {
      const n = 1 + Math.floor(hasard() * 3000)
      // Valeurs arrondies au dixième (nombreuses égalités), quelques valeurs aberrantes ; poids entiers, parfois nuls.
      const valeurs = Array.from({ length: n }, () => (hasard() < 0.01 ? 150 + hasard() * 50 : Math.round(hasard() * 1000) / 10))
      const poids = Array.from({ length: n }, () => (hasard() < 0.05 ? 0 : 1 + Math.floor(hasard() * 2000)))
      const classes = 2 + Math.floor(hasard() * 6)
      expect(quantilesPonderes(valeurs, poids, classes)).toEqual(quantilesParTri(valeurs, poids, classes))
    }
  })
})

describe('classeDe', () => {
  it('compte les seuils atteints', () => {
    expect([0, 15, 19.99, 20, 42].map((v) => classeDe(v, [15, 20, 25, 30]))).toEqual([0, 1, 1, 2, 4])
  })
})

describe('parts et écarts', () => {
  const lignes = [
    { code: 'A', cand: 1, voix: 30 }, { code: 'A', cand: 2, voix: 70 },
    { code: 'B', cand: 2, voix: 50 }, { code: 'C', cand: 1, voix: 0 }, { code: 'C', cand: 2, voix: 10 },
  ]
  const exprimes = new Map([['A', 100], ['B', 50], ['C', 10], ['D', 0]])
  const voix = voixParTerritoire(lignes, (l) => l.code, (cand) => cand === 1)

  it('distingue 0 % (candidat sans voix) de « pas de candidat »', () => {
    expect(Object.fromEntries(parts(voix, exprimes))).toEqual({ A: 0.3, B: null, C: 0 })
  })

  it("rend non comparable un territoire sans candidat ou absent d'un scrutin", () => {
    const avant = new Map([['A', 0.3], ['B', null], ['C', 0.1]])
    const apres = new Map([['A', 0.25], ['B', 0.2], ['E', 0.4]])
    const ecarts = ecartsEnPoints(avant, apres)
    expect(ecarts.get('A')).toBeCloseTo(-5)
    expect([ecarts.get('B'), ecarts.get('C'), ecarts.get('E')]).toEqual([null, null, null])
  })
})
