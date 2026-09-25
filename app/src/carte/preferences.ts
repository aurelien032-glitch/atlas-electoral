import { OPACITE_SUR_PLAN } from './couleurs'

// Préférence d'affichage, gardée par ce navigateur : hors de l'URL, un lien partagé montre l'opacité par défaut.
const CLE_OPACITE = 'atlas-electoral.opacite'

/** Opacité gardée, de 10 à 100 % par pas de 10 ; la valeur par défaut pour tout le reste. */
export function lireOpacite(texte: string | null): number {
  const v = texte === null ? Number.NaN : Number(texte)
  return v >= 0.1 && v <= 1 ? Math.round(v * 10) / 10 : OPACITE_SUR_PLAN
}

export function opaciteGardee(): number {
  try {
    return lireOpacite(window.localStorage.getItem(CLE_OPACITE))
  } catch {
    return OPACITE_SUR_PLAN // stockage refusé (navigation privée, réglages du navigateur)
  }
}

export function garderOpacite(opacite: number): void {
  try {
    if (opacite === OPACITE_SUR_PLAN) window.localStorage.removeItem(CLE_OPACITE)
    else window.localStorage.setItem(CLE_OPACITE, String(opacite))
  } catch {
    // Stockage refusé : le réglage vaut pour la visite.
  }
}
