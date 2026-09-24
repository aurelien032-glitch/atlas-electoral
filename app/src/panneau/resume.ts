import type { Mesure } from '../calculs/parts'
import type { Agregat } from '../donnees/types'

export type Classement = [code: string, valeur: number][]

/** Les n territoires retenus aux valeurs les plus hautes et les plus basses (valeurs sans objet exclues). */
export function extremes(valeurs: ReadonlyMap<string, Mesure>, retenus: ReadonlySet<string>, n = 3): { hauts: Classement; bas: Classement } {
  const tries: Classement = [...valeurs]
    .filter((e): e is [string, number] => e[1] !== null && retenus.has(e[0]))
    .sort((a, b) => b[1] - a[1])
  return { hauts: tries.slice(0, n), bas: tries.slice(-n).reverse() }
}

/** Nombre de territoires d'un niveau où chaque clé (candidature, bloc) arrive en tête, du plus au moins. */
export function compterTetes<K>(
  agregats: readonly Agregat[],
  niveau: Agregat['niveau'],
  cle: (cand: number) => K,
  retenus?: ReadonlySet<string>,
): [K, number][] {
  const comptes = new Map<K, number>()
  for (const a of agregats) {
    if (a.niveau !== niveau || a.tete === null || a.egalite || (retenus && !retenus.has(a.code))) continue
    const k = cle(a.tete)
    comptes.set(k, (comptes.get(k) ?? 0) + 1)
  }
  return [...comptes].sort((a, b) => b[1] - a[1])
}

/** « A, B et C » */
export function enumerer(elements: readonly string[]): string {
  if (elements.length <= 1) return elements.join('')
  return `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1]}`
}
