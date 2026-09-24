import { describe, expect, it } from 'vitest'
import type { Territoire } from '../donnees/types'
import { chercher, indexerCodesPostaux, normaliser, preparer } from './chercher'

const t = (niveau: Territoire['niveau'], code: string, nom: string, departement = code.slice(0, 2)): Territoire =>
  ({ niveau, code, nom, departement, ouest: 0, sud: 0, est: 1, nord: 1 })

const territoires = [
  t('departement', '69', 'Rhône'), t('departement', '42', 'Loire'), t('departement', '45', 'Loiret'),
  t('departement', '27', 'Eure'), t('departement', '75', 'Paris'),
  t('commune', '69123', 'Lyon'), t('commune', '27378', 'Lyons-la-Forêt'), t('commune', '42218', 'Saint-Étienne'),
  t('commune', '45234', 'Orléans'), t('commune', '75056', 'Paris'), t('commune', '42095', 'Saint-Étienne-le-Molard'),
]
const poids = new Map([['69123', 360000], ['27378', 700], ['42218', 100000], ['42095', 800], ['45234', 70000], ['75056', 1300000]])
const entrees = preparer(territoires, poids)
const noms = (texte: string) => chercher(entrees, texte).map((e) => e.territoire.nom)

describe('normaliser', () => {
  it('ignore accents, casse, tirets et abréviations de « saint »', () => {
    expect(normaliser('St-Étienne')).toBe('saint etienne')
    expect(normaliser("  Ste-Foy-lès-Lyon ")).toBe('sainte foy les lyon')
    expect(normaliser('Stains')).toBe('stains')
  })
})

describe('chercher', () => {
  it('met le nom exact devant les noms qui commencent pareil', () => {
    expect(noms('lyon')).toEqual(['Lyon', 'Lyons-la-Forêt'])
  })

  it('trouve sans accents ni tirets, et avec « st »', () => {
    expect(noms('orleans')).toEqual(['Orléans'])
    expect(noms('st etienne')).toEqual(['Saint-Étienne', 'Saint-Étienne-le-Molard'])
  })

  it('classe à pertinence égale par nombre d’inscrits, le département en premier', () => {
    expect(noms('paris')).toEqual(['Paris', 'Paris'])
    expect(chercher(entrees, 'paris')[0].territoire.niveau).toBe('departement')
  })

  it('cherche aussi par code', () => {
    expect(noms('69123')).toEqual(['Lyon'])
    expect(noms('42')).toEqual(['Loire', 'Saint-Étienne', 'Saint-Étienne-le-Molard'])
  })

  it('attend deux caractères', () => {
    expect(noms('l')).toEqual([])
  })

  it('donne le département des communes, pour les homonymes', () => {
    expect(chercher(entrees, 'lyon')[0].departement).toBe('Rhône')
  })
})

describe('codes postaux', () => {
  // Comme La Poste : les codes postaux de Lyon désignent ses arrondissements, qui n'ont pas d'inscrits dans les
  // poids de la recherche ; 69001 est aussi le code INSEE d'Affoux, et 13001 celui d'Aix-en-Provence.
  const autres = preparer([
    t('commune', '69001', 'Affoux'), t('arrondissement', '69381', 'Lyon 1er Arrondissement', '69'),
    t('commune', '13001', 'Aix-en-Provence'), t('arrondissement', '13201', 'Marseille 1er Arrondissement', '13'),
  ], new Map([['69001', 300], ['13001', 94000]]))
  const tout = [...entrees, ...autres]
  const postaux = indexerCodesPostaux([
    { code_postal: '69001', commune: '69381' }, { code_postal: '69002', commune: '69382' }, { code_postal: '13001', commune: '13201' },
    { code_postal: '69260', commune: '69123' }, { code_postal: '69290', commune: '69123' },
  ], tout)

  it('trouve un territoire par son code postal, avant la commune qui porte ce code INSEE', () => {
    const [premier, second] = chercher(tout, '69001', 8, postaux)
    expect(premier.territoire.nom).toBe('Lyon 1er Arrondissement')
    expect(premier.precision).toBe('code postal 69001')
    expect(second.territoire.nom).toBe('Affoux')
    // Même devant une commune bien plus peuplée.
    expect(chercher(tout, '13001', 8, postaux).map((e) => e.territoire.nom)).toEqual(['Marseille 1er Arrondissement', 'Aix-en-Provence'])
  })

  it('ne propose un territoire qu’une fois, même quand plusieurs codes postaux commencent pareil', () => {
    expect(chercher(tout, '692', 8, postaux).filter((e) => e.territoire.nom === 'Lyon')).toHaveLength(1)
  })
})
