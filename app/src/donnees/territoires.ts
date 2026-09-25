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
