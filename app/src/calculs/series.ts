import { TYPES, typeDe } from '../donnees/scrutins'
import type { Bloc, LigneSerie, ScrutinCatalogue } from '../donnees/types'

export const BLOCS_SERIE: readonly Bloc[] = ['EXG', 'GAU', 'CENT', 'DTE', 'EXD', 'DIV', 'NC']

/** Un tour de la série d'un territoire. */
export interface PointSerie {
  scrutin: ScrutinCatalogue
  /** Part de chaque bloc dans les exprimés (0 à 1) ; null sans candidat du bloc, ou au panachage. */
  parts: Record<Bloc, number | null>
  /** Votants sur inscrits (0 à 1). */
  participation: number | null
  /** On y votait pour des personnes (petite commune, municipales jusqu'en 2020) : aucune part. */
  panachage: boolean
}

// Les seconds tours opposent les seuls qualifiés : ils ne se comparent pas d'une élection à l'autre.
const premierTour = (id: string) => id.endsWith('_t1')

/** Premiers tours d'un type d'élection dans la série d'un territoire, du plus ancien au plus récent. */
export function pointsDuType(lignes: readonly LigneSerie[], scrutins: readonly ScrutinCatalogue[], type: string): PointSerie[] {
  const parId = new Map(scrutins.map((s) => [s.id, s]))
  const points: PointSerie[] = []
  for (const l of lignes) {
    const scrutin = parId.get(l.scrutin)
    if (!scrutin || typeDe(l.scrutin) !== type || !premierTour(l.scrutin)) continue
    const base = l.exprimes_listes
    const parts = {} as Record<Bloc, number | null>
    for (const b of BLOCS_SERIE) {
      const voix = l[b]
      parts[b] = base !== null && base > 0 && voix !== null ? voix / base : null
    }
    points.push({ scrutin, parts, participation: l.inscrits > 0 ? l.votants / l.inscrits : null, panachage: base === null })
  }
  return points.sort((a, b) => a.scrutin.date.localeCompare(b.scrutin.date))
}

/** Types d'élection dont la série compte au moins deux premiers tours : de quoi tracer une courbe. */
export function typesCouverts(lignes: readonly LigneSerie[]): string[] {
  const tours = new Map<string, number>()
  for (const l of lignes) {
    if (premierTour(l.scrutin)) tours.set(typeDe(l.scrutin), (tours.get(typeDe(l.scrutin)) ?? 0) + 1)
  }
  return TYPES.map((t) => t.code).filter((code) => (tours.get(code) ?? 0) >= 2)
}

/** Haut de l'axe des parts (en points) : un multiple rond au-dessus du maximum, et son pas. */
export function plafond(max: number): { haut: number; pas: number } {
  const pas = max <= 20 ? 5 : max <= 60 ? 10 : 20
  return { haut: Math.max(pas, Math.ceil(max / pas) * pas), pas }
}

/**
 * Positions (en pixels) des années à écrire sous l'axe : de gauche à droite, une étiquette n'est gardée
 * que si elle laisse assez de place à la précédente ; la dernière est toujours écrite.
 */
export function etiquettesGardees(positions: readonly number[], ecartMin: number): number[] {
  const gardees: number[] = []
  positions.forEach((x, i) => {
    const derniere = gardees[gardees.length - 1]
    if (derniere === undefined || x - positions[derniere] >= ecartMin) gardees.push(i)
    else if (i === positions.length - 1) gardees[gardees.length - 1] = i
  })
  return gardees
}
