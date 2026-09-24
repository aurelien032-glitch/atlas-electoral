/** Indice de la classe d'une valeur : nombre de seuils qu'elle atteint (seuil compris). */
export function classeDe(valeur: number, seuils: readonly number[]): number {
  let i = 0
  while (i < seuils.length && valeur >= seuils[i]) i++
  return i
}

// Pas « ronds » candidats pour arrondir les seuils, en points de pourcentage.
const PAS = [20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]

/**
 * Seuils d'une carte en dégradé : quantiles pondérés (chaque classe regroupe à peu près autant
 * d'électeurs, pas autant de territoires, que les petites communes domineraient), puis arrondis au
 * plus grand pas « rond » qui ne les déplace pas de plus de 40 % de leur plus petit écart.
 * Un seuil est la première valeur de la classe qu'il ouvre (classeDe compte la borne dans la classe
 * supérieure). Valeurs et seuils en points de pourcentage ; des seuils qui coïncident, ou qui
 * laisseraient la première classe vide, réduisent le nombre de classes.
 */
export function seuilsLisibles(valeurs: readonly number[], poids: readonly number[], classes = 5): number[] {
  const ordre = valeurs.map((_, i) => i).filter((i) => poids[i] > 0).sort((a, b) => valeurs[a] - valeurs[b])
  const total = ordre.reduce((somme, i) => somme + poids[i], 0)
  if (total === 0) return []
  const bruts: number[] = []
  let cumul = 0
  let k = 1
  for (const i of ordre) {
    while (k < classes && cumul >= (k * total) / classes) {
      bruts.push(valeurs[i])
      k++
    }
    cumul += poids[i]
  }
  const minimum = valeurs[ordre[0]]
  const distincts = [...new Set(bruts)].filter((s) => s > minimum)
  if (distincts.length < 2) return distincts.map(arrondi)
  const ecartMin = Math.min(...distincts.slice(1).map((s, i) => s - distincts[i]))
  for (const pas of PAS) {
    const arrondis = distincts.map((s) => arrondi(Math.round(s / pas) * pas))
    const croissants = arrondis.every((s, i) => i === 0 || s > arrondis[i - 1])
    const fideles = arrondis.every((s, i) => Math.abs(s - distincts[i]) <= 0.4 * ecartMin)
    if (croissants && fideles) return arrondis
  }
  return distincts.map(arrondi)
}

const arrondi = (x: number) => Math.round(x * 100) / 100
