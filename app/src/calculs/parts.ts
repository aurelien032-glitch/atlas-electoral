/** Valeur d'un territoire : un nombre, ou null quand elle n'a pas de sens (pas de candidat, pas comparable). */
export type Mesure = number | null

/**
 * Voix des candidatures retenues, par territoire. Un territoire figure dans le résultat dès qu'une
 * candidature retenue était sur ses bulletins, même sans voix : les fichiers publiés gardent les
 * lignes à 0 voix, ce qui distingue « 0 % » de « pas de candidat ».
 */
export function voixParTerritoire<L extends { cand: number; voix: number }>(
  lignes: readonly L[],
  code: (ligne: L) => string | undefined,
  retenue: (cand: number) => boolean,
): Map<string, number> {
  const sommes = new Map<string, number>()
  for (const ligne of lignes) {
    if (!retenue(ligne.cand)) continue
    const c = code(ligne)
    if (c !== undefined) sommes.set(c, (sommes.get(c) ?? 0) + ligne.voix)
  }
  return sommes
}

/**
 * Part des suffrages exprimés des candidatures retenues (0 à 1). Null quand aucune n'était sur les
 * bulletins ; absent quand le territoire n'a aucun suffrage exprimé (« sans résultat »).
 */
export function parts(voix: ReadonlyMap<string, number>, exprimes: ReadonlyMap<string, number>): Map<string, Mesure> {
  const resultat = new Map<string, Mesure>()
  for (const [code, e] of exprimes) {
    if (e <= 0) continue
    const v = voix.get(code)
    resultat.set(code, v === undefined ? null : v / e)
  }
  return resultat
}

/**
 * Écart entre deux scrutins, en points. Non comparable (null) quand la part manque d'un côté : bloc
 * sans candidat, ou territoire présent dans un seul des deux scrutins (commune créée ou fusionnée).
 */
export function ecartsEnPoints(avant: ReadonlyMap<string, Mesure>, apres: ReadonlyMap<string, Mesure>): Map<string, Mesure> {
  const resultat = new Map<string, Mesure>()
  for (const code of new Set([...avant.keys(), ...apres.keys()])) {
    const a = avant.get(code)
    const b = apres.get(code)
    resultat.set(code, a == null || b == null ? null : 100 * (b - a))
  }
  return resultat
}
