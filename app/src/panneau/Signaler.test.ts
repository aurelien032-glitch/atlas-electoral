import { describe, expect, it } from 'vitest'
import { adresseSignalement } from './Signaler'

describe('ticket de signalement', () => {
  it('remplit le formulaire avec la vue et son titre', () => {
    const adresse = new URL(adresseSignalement(
      'https://atlas-electoral.pages.dev/?scrutin=2024_legi_t1&sel=bureau:33063_2002#11.5/44.8/-0.6',
      'Bordeaux, bureau 2002 · Législatives 2024, 1er tour',
    ))
    expect(adresse.origin + adresse.pathname).toBe('https://github.com/aurelien032-glitch/atlas-electoral/issues/new')
    expect(adresse.searchParams.get('template')).toBe('erreur.yml')
    expect(adresse.searchParams.get('title')).toBe('Erreur : Bordeaux, bureau 2002 · Législatives 2024, 1er tour')
    // La vue entière, cadrage de la carte compris : « & » et « # » ne coupent pas le paramètre.
    expect(adresse.searchParams.get('lien'))
      .toBe('https://atlas-electoral.pages.dev/?scrutin=2024_legi_t1&sel=bureau:33063_2002#11.5/44.8/-0.6')
    expect(adresse.hash).toBe('')
  })
})
