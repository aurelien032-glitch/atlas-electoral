import { describe, expect, it } from 'vitest'
import type { Resultat } from '../donnees/types'
import { COULEUR_BLOC, GRIS, PALETTE_EVOLUTION, SEUILS_EVOLUTION, palier } from './couleurs'
import { etatClasse, etatTete } from './etats'

const resultat: Resultat = {
  inscrits: 1000, votants: 700, blancs: 20, nuls: 10, exprimes: 670,
  tete: 0, egalite: false, avance_x10000: 1200,
}

describe('palier', () => {
  it("classe l'avance en trois paliers (5 et 15 points)", () => {
    expect([0, 499, 500, 1499, 1500, 10000].map((a) => palier(a).libelle))
      .toEqual(['serrée', 'serrée', 'nette', 'nette', 'large', 'large'])
  })
})

describe('etatTete', () => {
  it('colore selon le bloc de la tête et nuance selon son avance', () => {
    expect(etatTete(resultat, () => 'GAU')).toEqual({ couleur: COULEUR_BLOC.GAU, opacite: 0.9, hachure: false })
  })

  it('met les égalités dans leur propre catégorie, sans nuance', () => {
    expect(etatTete({ ...resultat, egalite: true }, () => 'EXD')).toEqual({ couleur: GRIS.egalite, opacite: 1, hachure: false })
  })

  it('ne nuance pas les gris (divers, non classé)', () => {
    expect(etatTete({ ...resultat, avance_x10000: 100 }, () => 'NC')).toEqual({ couleur: GRIS.nonClasse, opacite: 1, hachure: false })
    expect(etatTete({ ...resultat, avance_x10000: 100 }, () => 'DIV')).toEqual({ couleur: GRIS.divers, opacite: 1, hachure: false })
  })

  it('colore un territoire à plusieurs élections selon le bloc le plus voté et son avance', () => {
    const plusieurs = { ...resultat, bloc_en_tete: 'DTE' as const, egalite_bloc: false, avance_bloc_x10000: 2000 }
    expect(etatTete(plusieurs, () => 'GAU')).toEqual({ couleur: COULEUR_BLOC.DTE, opacite: 1, hachure: false })
    expect(etatTete({ ...plusieurs, egalite_bloc: true }, () => 'GAU')).toEqual({ couleur: GRIS.egalite, opacite: 1, hachure: false })
  })

  it('laisse sans résultat un territoire sans suffrage exprimé', () => {
    expect(etatTete({ ...resultat, exprimes: 0 }, () => 'CENT')).toBeNull()
    expect(etatTete({ ...resultat, tete: null }, () => 'CENT')).toBeNull()
  })
})

describe('etatClasse', () => {
  it('prend la couleur de la classe, bornes comprises dans la classe supérieure', () => {
    const seuils = [...SEUILS_EVOLUTION]
    expect([-12, -10, -3, -1, 0.99, 1, 25].map((v) => etatClasse(v, seuils, PALETTE_EVOLUTION).couleur))
      .toEqual([0, 1, 2, 3, 3, 4, 6].map((i) => PALETTE_EVOLUTION[i]))
  })

  it('hachure une valeur sans objet', () => {
    expect(etatClasse(null, [1], ['#000', '#fff']).hachure).toBe(true)
  })
})
