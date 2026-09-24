import type { ScrutinCatalogue } from './types'

/** Types d'élection, dans l'ordre du sélecteur. L'identifiant d'un scrutin est « année_type_tour ». */
export const TYPES = [
  { code: 'pres', libelle: 'Présidentielles' },
  { code: 'legi', libelle: 'Législatives' },
  { code: 'euro', libelle: 'Européennes' },
  { code: 'regi', libelle: 'Régionales' },
  { code: 'dpmt', libelle: 'Départementales' },
  { code: 'cant', libelle: 'Cantonales' },
  { code: 'muni', libelle: 'Municipales' },
] as const

export const typeDe = (id: string) => id.split('_')[1] ?? ''
const tourDe = (id: string) => id.split('_')[2] ?? ''

/** Scrutins groupés par type, du plus récent au plus ancien dans chaque groupe. */
export function grouper(scrutins: readonly ScrutinCatalogue[]) {
  return TYPES
    .map((t) => ({ ...t, scrutins: scrutins.filter((s) => typeDe(s.id) === t.code).sort((a, b) => b.date.localeCompare(a.date)) }))
    .filter((g) => g.scrutins.length > 0)
}

/** Scrutin affiché par défaut : le premier tour de la dernière présidentielle. */
export function scrutinParDefaut(scrutins: readonly ScrutinCatalogue[]): ScrutinCatalogue | undefined {
  const presidentielles = scrutins.filter((s) => typeDe(s.id) === 'pres' && tourDe(s.id) === 't1')
  return presidentielles.sort((a, b) => b.date.localeCompare(a.date))[0] ?? scrutins[scrutins.length - 1]
}

/**
 * Scrutin de départ par défaut du mode Évolution : le précédent du même type et du même tour
 * (présidentielle 2017 pour 2022), sinon le précédent dans le temps, sinon le suivant.
 */
export function scrutinPrecedent(scrutins: readonly ScrutinCatalogue[], courant: ScrutinCatalogue): ScrutinCatalogue | undefined {
  const avant = scrutins.filter((s) => s.date < courant.date).sort((a, b) => b.date.localeCompare(a.date))
  return avant.find((s) => typeDe(s.id) === typeDe(courant.id) && tourDe(s.id) === tourDe(courant.id))
    ?? avant[0]
    ?? scrutins.find((s) => s.id !== courant.id)
}
