import { describe, expect, it } from 'vitest'
import type { Resultat } from '../donnees/types'
import { palier } from './couleurs'
import { CATEGORIES, etatTerritoire } from './etats'

const resultat: Resultat = {
  inscrits: 1000, votants: 700, blancs: 20, nuls: 10, exprimes: 670,
  tete: 0, egalite: false, avance_x10000: 1200,
}

describe('palier', () => {
  it("classe l'avance en trois paliers (5 et 15 points)", () => {
    expect([0, 499, 500, 1499, 1500, 10000].map((a) => palier(a).libelle))
      .toEqual(['serré', 'serré', 'net', 'net', 'large', 'large'])
  })
})

describe('etatTerritoire', () => {
  it('colore selon le bloc de la tête et nuance selon son avance', () => {
    expect(etatTerritoire(resultat, () => 'GAU')).toEqual({ categorie: CATEGORIES.indexOf('GAU'), opacite: 0.9 })
  })

  it('met les égalités dans leur propre catégorie, sans nuance', () => {
    expect(etatTerritoire({ ...resultat, egalite: true }, () => 'EXD'))
      .toEqual({ categorie: CATEGORIES.indexOf('EGALITE'), opacite: 1 })
  })

  it("ne nuance pas les gris (divers, non classé)", () => {
    expect(etatTerritoire({ ...resultat, avance_x10000: 100 }, () => 'NC'))
      .toEqual({ categorie: CATEGORIES.indexOf('NC'), opacite: 1 })
  })

  it('laisse sans résultat un territoire sans suffrage exprimé', () => {
    expect(etatTerritoire({ ...resultat, exprimes: 0 }, () => 'CENT')).toBeNull()
    expect(etatTerritoire({ ...resultat, tete: null }, () => 'CENT')).toBeNull()
  })
})
