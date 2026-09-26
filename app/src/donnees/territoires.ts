import type { Selection } from '../vue'
import type { Circonscription, Passage, Territoire } from './types'

/** Département d'une commune : même règle que le pipeline (trois caractères outre-mer, deux ailleurs). */
export const departementDe = (codeCommune: string) =>
  codeCommune.startsWith('97') || codeCommune.startsWith('98') ? codeCommune.slice(0, 3) : codeCommune.slice(0, 2)

/**
 * Commune d'un bureau, au COG 2026 : les codes de bureau sont « commune_numéro », avec la commune de
 * l'année du vote ; une commune fusionnée depuis est remplacée par sa commune nouvelle.
 */
export const communeDu = (codeBureau: string, passage?: ReadonlyMap<string, string>) => {
  const commune = codeBureau.split('_')[0]
  return passage?.get(commune) ?? commune
}
export const numeroDu = (codeBureau: string) => codeBureau.split('_')[1] ?? codeBureau

// Métropole et départements d'outre-mer ; 975 (Saint-Pierre-et-Miquelon) est une collectivité.
const DEPARTEMENT = /^(\d{2}|2A|2B|97[12346])$/

/**
 * Index des territoires par code : départements (« 69 »), circonscriptions (« 69-02 ») et communes
 * (« 69123 ») ne partagent aucun code.
 */
export interface Index {
  noms: Map<string, string>
  territoires: Map<string, Territoire>
  passage: Map<string, string>
  /** Communes nées d'une fusion : leurs résultats anciens additionnent les communes qui les ont formées. */
  fusionnees: Set<string>
  /** Départements de métropole et d'outre-mer (hors collectivités d'outre-mer et Français de l'étranger). */
  departements: Set<string>
}

export function indexer(
  communes: readonly Territoire[],
  passage: readonly Passage[] = [],
  circonscriptions: readonly Circonscription[] = [],
): Index {
  const territoires: Territoire[] = [
    ...communes,
    ...circonscriptions.map((c) => ({ ...c, niveau: 'circonscription' as const, nom: c.libelle })),
  ]
  return {
    noms: new Map(territoires.map((t) => [t.code, t.nom])),
    territoires: new Map(territoires.map((t) => [t.code, t])),
    passage: new Map(passage.map((p) => [p.ancien, p.actuel])),
    fusionnees: new Set(passage.filter((p) => p.fusion).map((p) => p.actuel)),
    departements: new Set(territoires.filter((t) => t.niveau === 'departement' && DEPARTEMENT.test(t.code)).map((t) => t.code)),
  }
}

export function emprise(t: Territoire | undefined): [number, number, number, number] | null {
  if (!t || t.ouest === null || t.sud === null || t.est === null || t.nord === null) return null
  return [t.ouest, t.sud, t.est, t.nord]
}

/** Arrondissement de Paris, Lyon ou Marseille (codes INSEE 75101-75120, 69381-69389, 13201-13216). */
export const estArrondissement = (code: string) =>
  (code >= '75101' && code <= '75120') || (code >= '69381' && code <= '69389') || (code >= '13201' && code <= '13216')

/** Territoire d'un code INSEE de commune : l'arrondissement à Paris, Lyon et Marseille. */
export const selectionDeCommune = (code: string): Selection =>
  ({ niveau: estArrondissement(code) ? 'arrondissement' : 'commune', code })

/** Ville d'un arrondissement. */
export const villeDe = (arrondissement: string) =>
  arrondissement.startsWith('751') ? '75056' : arrondissement.startsWith('6938') ? '69123' : '13055'

/**
 * Arrondissement d'un bureau de Paris, Lyon ou Marseille, d'après son numéro : « 75056_1512 » est au 15e
 * (75115). Même règle que le pipeline ; undefined ailleurs, ou pour un bureau hors de la règle.
 */
export function arrondissementDu(codeBureau: string): string | undefined {
  const [commune, numero = ''] = codeBureau.split('_')
  const deux = numero.slice(0, 2)
  if (!/^\d\d$/.test(deux)) return undefined
  const n = Number(deux)
  if (commune === '75056' && n >= 1 && n <= 20) return `751${deux}`
  if (commune === '69123' && n >= 1 && n <= 9) return `6938${n}`
  if (commune === '13055' && n >= 1 && n <= 16) return `132${deux}`
  return undefined
}

/**
 * Municipales par secteur (jusqu'en 2020) : secteurs de plusieurs arrondissements, où chaque liste se présentait dans
 * tous (loi PLM). Marseille en compte huit de deux arrondissements, numérotés dans cet ordre ; à Paris, Paris Centre
 * réunit les quatre premiers en 2020. Ailleurs, et à Lyon, un arrondissement forme son secteur. Composition vérifiée
 * dans les résultats de 2008, 2014 et 2020 : les arrondissements d'un même secteur y ont les mêmes listes.
 */
const SECTEURS_MARSEILLE = [
  ['13201', '13207'], ['13202', '13203'], ['13204', '13205'], ['13206', '13208'],
  ['13209', '13210'], ['13211', '13212'], ['13213', '13214'], ['13215', '13216'],
]
const PARIS_CENTRE = ['75101', '75102', '75103', '75104']

const ordinal = (n: number) => `${n}${n === 1 ? 'er' : 'e'}`
/** Rang d'un arrondissement dans sa ville : « 75115 » → 15, « 69383 » → 3. */
const rangArrondissement = (code: string) => Number(code.startsWith('6938') ? code.slice(4) : code.slice(3))

export interface Secteur {
  /** Nom court, pour un intitulé de colonne : « 1er secteur », « Paris Centre ». */
  nom: string
  arrondissements: readonly string[]
}

/** Secteur de plusieurs arrondissements auquel appartient un arrondissement, aux municipales de cette année-là. */
export function secteurDe(arrondissement: string, annee: number): Secteur | undefined {
  if (annee > 2020) return undefined
  const i = SECTEURS_MARSEILLE.findIndex((s) => s.includes(arrondissement))
  if (i >= 0) return { nom: `${ordinal(i + 1)} secteur`, arrondissements: SECTEURS_MARSEILLE[i] }
  if (annee === 2020 && PARIS_CENTRE.includes(arrondissement)) return { nom: 'Paris Centre', arrondissements: PARIS_CENTRE }
  return undefined
}

/** « les 1er et 7e arrondissements », « les 1er, 2e, 3e et 4e arrondissements ». */
export function lesArrondissements(codes: readonly string[]): string {
  const rangs = codes.map((c) => ordinal(rangArrondissement(c)))
  return `les ${rangs.slice(0, -1).join(', ')} et ${rangs[rangs.length - 1]} arrondissements`
}

/** Nom affiché d'un territoire sélectionné : « Lyon, bureau 0816 », « Lyon », « Rhône, 2e circonscription ». */
export function titreDe(selection: Selection, index: Pick<Index, 'noms' | 'passage'>): string {
  if (selection.niveau === 'bureau') {
    const commune = communeDu(selection.code, index.passage)
    return `${index.noms.get(commune) ?? commune}, bureau ${numeroDu(selection.code)}`
  }
  const nom = index.noms.get(selection.code)
  // Hors des législatives de 2012 et après, l'index ne contient pas les circonscriptions : leur nom se déduit du code.
  if (nom === undefined && selection.niveau === 'circonscription') {
    const departement = departementDeCirconscription(selection.code)
    const numero = Number(selection.code.split('-')[1])
    return `${index.noms.get(departement) ?? departement}, ${numero}${numero === 1 ? 're' : 'e'} circonscription`
  }
  return nom ?? selection.code
}

/** Département d'une circonscription (« 69-02 » → « 69 » ; « ZX-01 » : Saint-Barthélemy et Saint-Martin). */
export const departementDeCirconscription = (code: string) => code.split('-')[0]
