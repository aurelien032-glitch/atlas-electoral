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
  const q = quantilesPonderes(valeurs, poids, classes)
  if (!q) return []
  const { bruts, minimum } = q
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

// Cases de l'histogramme des quantiles : quelques dizaines de valeurs chacune pour 70 000 bureaux.
const CASES = 4096

/**
 * Quantiles pondérés, croissants : pour chaque objectif k × total / classes, la valeur du premier territoire (par
 * valeur croissante) dont les poids qui le précèdent atteignent l'objectif ; seuls comptent les poids positifs. Sans
 * trier les 70 000 bureaux (0,4 s sur un téléphone) : un histogramme situe chaque objectif dans une case, dont seules
 * les valeurs sont triées. Même résultat qu'un tri complet, les poids étant des entiers (sommes exactes).
 */
export function quantilesPonderes(
  valeurs: readonly number[],
  poids: readonly number[],
  classes: number,
): { bruts: number[]; minimum: number } | null {
  let minimum = Infinity
  let maximum = -Infinity
  let total = 0
  for (let i = 0; i < valeurs.length; i++) {
    if (!(poids[i] > 0)) continue
    minimum = Math.min(minimum, valeurs[i])
    maximum = Math.max(maximum, valeurs[i])
    total += poids[i]
  }
  if (total === 0) return null
  const largeur = (maximum - minimum) / CASES || 1
  const caseDe = (v: number) => Math.min(CASES - 1, Math.floor((v - minimum) / largeur))
  const poidsCase = new Float64Array(CASES)
  const premiereValeur = new Float64Array(CASES).fill(Infinity)
  for (let i = 0; i < valeurs.length; i++) {
    if (!(poids[i] > 0)) continue
    const c = caseDe(valeurs[i])
    poidsCase[c] += poids[i]
    premiereValeur[c] = Math.min(premiereValeur[c], valeurs[i])
  }
  const objectif = (k: number) => (k * total) / classes
  // Cases où un objectif est atteint : leurs valeurs seront parcourues une à une, dans l'ordre.
  const detail = new Map<number, [number, number][]>()
  let cumul = 0
  for (let c = 0, k = 1; c < CASES && k < classes; c++) {
    if (poidsCase[c] === 0) continue
    while (k < classes && objectif(k) <= cumul + poidsCase[c]) {
      detail.set(c, [])
      k++
    }
    cumul += poidsCase[c]
  }
  for (let i = 0; i < valeurs.length; i++) {
    if (poids[i] > 0) detail.get(caseDe(valeurs[i]))?.push([valeurs[i], poids[i]])
  }
  const bruts: number[] = []
  cumul = 0
  for (let c = 0, k = 1; c < CASES && k < classes; c++) {
    if (poidsCase[c] === 0) continue
    const elements = detail.get(c)
    if (!elements) {
      // Objectif atteint pile à la fin de la case précédente : c'est la plus petite valeur de celle-ci.
      while (k < classes && cumul >= objectif(k)) {
        bruts.push(premiereValeur[c])
        k++
      }
      cumul += poidsCase[c]
      continue
    }
    elements.sort((a, b) => a[0] - b[0])
    for (const [valeur, p] of elements) {
      while (k < classes && cumul >= objectif(k)) {
        bruts.push(valeur)
        k++
      }
      cumul += p
    }
  }
  return { bruts, minimum }
}
