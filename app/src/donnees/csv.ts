/**
 * Lecture d'un CSV à en-tête (référentiels publiés : grille des nuances, totaux officiels). Gère les
 * champs entre guillemets, qui peuvent contenir des virgules, des guillemets doublés et des retours à
 * la ligne.
 */
export function lireCsv(texte: string): Record<string, string>[] {
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let guillemets = false
  const source = texte.replace(/^﻿/, '')
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (guillemets) {
      if (c === '"' && source[i + 1] === '"') { champ += '"'; i++ }
      else if (c === '"') guillemets = false
      else champ += c
    } else if (c === '"') guillemets = true
    else if (c === ',') { ligne.push(champ); champ = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++
      ligne.push(champ)
      if (ligne.some((v) => v !== '')) lignes.push(ligne)
      ligne = []
      champ = ''
    } else champ += c
  }
  ligne.push(champ)
  if (ligne.some((v) => v !== '')) lignes.push(ligne)
  const [entete = [], ...corps] = lignes
  return corps.map((valeurs) => Object.fromEntries(entete.map((nom, i) => [nom, valeurs[i] ?? ''])))
}
