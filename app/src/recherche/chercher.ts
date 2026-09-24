import type { Territoire } from '../donnees/types'

/**
 * Forme de comparaison d'un nom : sans accents ni casse, tirets et apostrophes en espaces, « St » et
 * « Ste » développés (« St-Étienne », « st etienne » et « Saint-Étienne » se rejoignent).
 */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[-'’.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^| )ste(?= |$)/g, '$1sainte')
    .replace(/(^| )st(?= |$)/g, '$1saint')
}

/** Territoire prêt à chercher : nom normalisé, département pour distinguer les homonymes, poids. */
export interface Entree {
  territoire: Territoire
  forme: string
  mots: string[]
  /** Nom du département de la commune (les « Saint-Martin » sont nombreux). */
  departement: string | undefined
  /** Nombre d'inscrits : à pertinence égale, les territoires peuplés passent devant. */
  poids: number
}

export function preparer(territoires: readonly Territoire[], poids: ReadonlyMap<string, number>): Entree[] {
  const noms = new Map(territoires.filter((t) => t.niveau === 'departement').map((t) => [t.code, t.nom]))
  return territoires.map((t) => {
    const forme = normaliser(t.nom)
    return {
      territoire: t,
      forme,
      mots: forme.split(' '),
      departement: t.niveau === 'commune' ? noms.get(t.departement) : undefined,
      // Un département passe devant ses communes quand les noms se valent (« Paris », « Rhône »).
      poids: t.niveau === 'departement' ? Infinity : (poids.get(t.code) ?? 0),
    }
  })
}

// Pertinence, de la meilleure à la moins bonne : nom exact, début du nom, début de chaque mot cherché,
// simple inclusion. Un code INSEE ou de département se cherche par son début.
function pertinence(entree: Entree, requete: string, mots: string[]): number | null {
  if (entree.forme === requete) return 0
  if (entree.forme.startsWith(requete)) return 1
  if (mots.every((m) => entree.mots.some((mot) => mot.startsWith(m)))) return 2
  if (entree.forme.includes(requete)) return 3
  return null
}

export function chercher(entrees: readonly Entree[], texte: string, n = 8): Entree[] {
  const requete = normaliser(texte)
  if (requete.length < 2) return []
  const parCode = /^[0-9][0-9ab]?[0-9]*$/.test(requete)
  const mots = requete.split(' ')
  const trouves: [Entree, number][] = []
  for (const entree of entrees) {
    const score = parCode
      ? (entree.territoire.code.toLowerCase().startsWith(requete) ? (entree.territoire.code.length === requete.length ? 0 : 1) : null)
      : pertinence(entree, requete, mots)
    if (score !== null) trouves.push([entree, score])
  }
  trouves.sort((a, b) => a[1] - b[1] || b[0].poids - a[0].poids || a[0].forme.localeCompare(b[0].forme))
  return trouves.slice(0, n).map(([entree]) => entree)
}
