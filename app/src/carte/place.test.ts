import { describe, expect, it } from 'vitest'
import { estFrance, FRANCE_METROPOLITAINE, marges, repliParDefaut, type Place } from './place'

const tout = { legendeRepliee: false, encartsDeplies: true, voletReplie: false } satisfies Place
const ordinateur = { largeur: 1460, hauteur: 1080, volet: false, retrait: 24 }

describe('marges du cadrage', () => {
  it('laisse la place à la légende et aux encarts dépliés, sur ordinateur', () => {
    expect(marges(tout, ordinateur, 'france')).toEqual({ top: 84, bottom: 40, left: 320, right: 298 })
  })

  it('ne compte pas les encarts pour un territoire : la carte zoomée les masque', () => {
    expect(marges(tout, ordinateur, 'territoire').right).toBe(72)
  })

  it('réduit la légende repliée à une ligne en bas à gauche', () => {
    expect(marges({ ...tout, legendeRepliee: true }, ordinateur, 'france')).toMatchObject({ left: 24, bottom: 72 })
  })

  it('pose encarts puis légende sur la carte plutôt que de l\'écraser', () => {
    const etroit = { largeur: 700, hauteur: 768, volet: false, retrait: 24 }
    expect(marges(tout, etroit, 'france')).toMatchObject({ left: 320, right: 72 })
    const tresEtroit = { largeur: 500, hauteur: 390, volet: false, retrait: 24 }
    expect(marges(tout, tresEtroit, 'france')).toMatchObject({ left: 24, right: 72 })
  })

  it('garde le haut de l\'écran au-dessus du volet, sources comprises, et dégage l\'Alsace de la colonne du zoom', () => {
    const telephone = { largeur: 390, hauteur: 844, volet: true, retrait: 12 }
    expect(marges(tout, telephone, 'france')).toEqual({ top: 72, bottom: 354 + 36, left: 16, right: 32 })
    expect(marges({ ...tout, voletReplie: true }, telephone, 'france').bottom).toBe(73 + 36)
  })

  it('décale la métropole pour les encarts dépliés dans le volet d\'une tablette, pas d\'un téléphone', () => {
    const tablette = { largeur: 768, hauteur: 1024, volet: true, retrait: 12 }
    expect(marges(tout, tablette, 'france').right).toBe(332)
    expect(marges(tout, tablette, 'territoire').right).toBe(32)
    expect(marges(tout, { largeur: 390, hauteur: 844, volet: true, retrait: 12 }, 'france').right).toBe(32)
  })

  it('renonce à la place des sources quand l\'écran est trop bas', () => {
    const couche = { largeur: 560, hauteur: 300, volet: true, retrait: 12 }
    expect(marges(tout, couche, 'france').bottom).toBe(126)
  })

  it('resserre les marges d\'un téléphone tenu à l\'horizontale, panneau à gauche', () => {
    const replies = { legendeRepliee: true, encartsDeplies: false, voletReplie: false }
    // 667 × 375, moins le panneau de 320 px.
    const horizontal = { largeur: 347, hauteur: 375, volet: false, retrait: 12 }
    expect(marges(replies, horizontal, 'france')).toEqual({ top: 72, bottom: 60, left: 12, right: 60 })
    expect(marges(tout, horizontal, 'france')).toMatchObject({ left: 12, right: 60 })
  })
})

describe('repli au premier passage', () => {
  it('déplie légende et encarts sur grand écran seulement', () => {
    expect(repliParDefaut('legende', 1920, false)).toBe(false)
    expect(repliParDefaut('encarts', 1920, false)).toBe(false)
    expect(repliParDefaut('encarts', 1440, false)).toBe(true)
    expect(repliParDefaut('legende', 1440, false)).toBe(false)
    expect(repliParDefaut('legende', 1024, false)).toBe(true)
  })

  it('garde la légende dépliée dans le volet, et les encarts repliés', () => {
    expect(repliParDefaut('legende', 390, true)).toBe(false)
    expect(repliParDefaut('encarts', 820, true)).toBe(true)
  })
})

it('reconnaît le cadrage de la métropole entière', () => {
  expect(estFrance([...FRANCE_METROPOLITAINE])).toBe(true)
  expect(estFrance([4.7, 45.7, 4.9, 45.8])).toBe(false)
})
