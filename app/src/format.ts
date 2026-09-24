// Typographie française : virgule décimale, espace fine insécable avant « % », vrai signe moins.
const ESPACE_FINE = ' '

const nombre = new Intl.NumberFormat('fr-FR')
export const formatNombre = (n: number) => nombre.format(n)

const decimales = (x: number, n: number) => x.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n })

/** Part (0 à 1) en pourcentage : 0,1234 → « 12,3 % ». */
export const formatPart = (part: number, n = 1) => `${decimales(100 * part, n)}${ESPACE_FINE}%`

/** Valeur déjà en points de pourcentage : 12,34 → « 12,3 % ». */
export const formatPourcent = (points: number, n = 1) => `${decimales(points, n)}${ESPACE_FINE}%`

/** Écart en points, signé : +2,5 ; −0,4 ; 0,0 sans signe. */
export function formatEcart(points: number, n = 1): string {
  const arrondi = Number(points.toFixed(n))
  const signe = arrondi > 0 ? '+' : arrondi < 0 ? '−' : ''
  return `${signe}${decimales(Math.abs(arrondi), n)}`
}

/** Seuil de légende, sans zéros inutiles : 15 → « 15 », 0,5 → « 0,5 ». */
export const formatSeuil = (s: number) => s.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

export const avecPourcent = (texte: string) => `${texte}${ESPACE_FINE}%`
