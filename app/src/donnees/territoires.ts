import type { Selection } from '../vue'
import type { Territoire } from './types'

/** Département d'une commune : même règle que le pipeline (trois caractères outre-mer, deux ailleurs). */
export const departementDe = (codeCommune: string) =>
  codeCommune.startsWith('97') || codeCommune.startsWith('98') ? codeCommune.slice(0, 3) : codeCommune.slice(0, 2)

/** Commune d'un bureau : les codes de bureau sont « commune_numéro ». */
export const communeDu = (codeBureau: string) => codeBureau.split('_')[0]
export const numeroDu = (codeBureau: string) => codeBureau.split('_')[1] ?? codeBureau

// Métropole et départements d'outre-mer ; 975 (Saint-Pierre-et-Miquelon) est une collectivité.
const DEPARTEMENT = /^(\d{2}|2A|2B|97[12346])$/

/** Index des territoires par code (départements et communes ne partagent aucun code). */
export interface Index {
  noms: Map<string, string>
  territoires: Map<string, Territoire>
  /** Départements de métropole et d'outre-mer (hors collectivités d'outre-mer et Français de l'étranger). */
  departements: Set<string>
}

export function indexer(territoires: readonly Territoire[]): Index {
  return {
    noms: new Map(territoires.map((t) => [t.code, t.nom])),
    territoires: new Map(territoires.map((t) => [t.code, t])),
    departements: new Set(territoires.filter((t) => t.niveau === 'departement' && DEPARTEMENT.test(t.code)).map((t) => t.code)),
  }
}

export function emprise(t: Territoire | undefined): [number, number, number, number] | null {
  if (!t || t.ouest === null || t.sud === null || t.est === null || t.nord === null) return null
  return [t.ouest, t.sud, t.est, t.nord]
}

/** Nom affiché d'un territoire sélectionné : « Lyon, bureau 0816 », « Lyon », « Rhône ». */
export function titreDe(selection: Selection, noms: ReadonlyMap<string, string>): string {
  if (selection.niveau === 'bureau') {
    const commune = communeDu(selection.code)
    return `${noms.get(commune) ?? commune}, bureau ${numeroDu(selection.code)}`
  }
  return noms.get(selection.code) ?? selection.code
}
