import { describe, expect, it } from 'vitest'
import { lireAdresses, ressembleAUneAdresse } from './adresses'

describe('recherche d’adresse', () => {
  it('n’interroge le géocodeur que pour ce qui ressemble à une adresse', () => {
    expect(ressembleAUneAdresse('12 rue de la paix')).toBe(true)
    expect(ressembleAUneAdresse('rue mouffetard')).toBe(true)
    expect(ressembleAUneAdresse('8 bd du port')).toBe(true)
    expect(ressembleAUneAdresse('Place Bellecour Lyon')).toBe(true)
    expect(ressembleAUneAdresse('allée des Érables')).toBe(true)
  })

  it('laisse les noms de communes et les codes à l’index, sans quitter le navigateur', () => {
    expect(ressembleAUneAdresse('lyon')).toBe(false)
    expect(ressembleAUneAdresse('la rochelle')).toBe(false)
    expect(ressembleAUneAdresse('saint-étienne')).toBe(false)
    expect(ressembleAUneAdresse('ruelle-sur-touvre')).toBe(true) // commune dont le nom commence par un type de voie
    expect(ressembleAUneAdresse('69001')).toBe(false)
    expect(ressembleAUneAdresse('12')).toBe(false)
  })

  it('lit les adresses du géocodeur et laisse les communes à l’index des territoires', () => {
    const reponse = {
      features: [
        {
          geometry: { coordinates: [2.331303, 48.869141] },
          properties: {
            label: '12 Rue de la Paix 75002 Paris', name: '12 Rue de la Paix', postcode: '75002', city: 'Paris',
            citycode: '75102', type: 'housenumber', id: '75102_6998_00012',
          },
        },
        { geometry: { coordinates: [4.835, 45.758] }, properties: { label: 'Lyon', name: 'Lyon', citycode: '69123', type: 'municipality' } },
        { geometry: {}, properties: { label: 'Sans position', citycode: '01001', type: 'street' } },
      ],
    }
    expect(lireAdresses(reponse)).toEqual([{
      id: '75102_6998_00012', libelle: '12 Rue de la Paix 75002 Paris', nom: '12 Rue de la Paix', precision: '75002 Paris',
      type: 'housenumber', lon: 2.331303, lat: 48.869141, commune: '75102',
    }])
    expect(lireAdresses({})).toEqual([])
  })
})
