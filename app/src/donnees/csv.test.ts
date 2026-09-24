import { describe, expect, it } from 'vitest'
import { lireCsv } from './csv'

describe('lireCsv', () => {
  it('lit un en-tête et des champs entre guillemets', () => {
    const texte = 'code,libelle,note\r\nFI,La France insoumise,"Bloc EXG, famille décidée le 24/09"\r\nDSV,"Droite ""souverainiste""",\r\n'
    expect(lireCsv(texte)).toEqual([
      { code: 'FI', libelle: 'La France insoumise', note: 'Bloc EXG, famille décidée le 24/09' },
      { code: 'DSV', libelle: 'Droite "souverainiste"', note: '' },
    ])
  })

  it('ignore la marque d’ordre des octets et les lignes vides', () => {
    expect(lireCsv('﻿a,b\n\n1,2')).toEqual([{ a: '1', b: '2' }])
  })
})
