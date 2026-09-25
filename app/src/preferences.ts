import { OPACITE_SUR_PLAN } from './carte/couleurs'

// Préférences d'affichage, gardées par ce navigateur (opacité des couleurs, panneau, légende et encarts
// repliés) : hors de l'URL, un lien partagé montre l'affichage par défaut.
const CLE = 'atlas-electoral.'

function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(CLE + cle)
  } catch {
    return null // stockage refusé (navigation privée, réglages du navigateur)
  }
}

function garder(cle: string, valeur: string | null): void {
  try {
    if (valeur === null) window.localStorage.removeItem(CLE + cle)
    else window.localStorage.setItem(CLE + cle, valeur)
  } catch {
    // Stockage refusé : le réglage vaut pour la visite.
  }
}

/** Opacité gardée, de 10 à 100 % par pas de 10 ; la valeur par défaut pour tout le reste. */
export function lireOpacite(texte: string | null): number {
  const v = texte === null ? Number.NaN : Number(texte)
  return v >= 0.1 && v <= 1 ? Math.round(v * 10) / 10 : OPACITE_SUR_PLAN
}

export const opaciteGardee = () => lireOpacite(lire('opacite'))
export const garderOpacite = (opacite: number) => garder('opacite', opacite === OPACITE_SUR_PLAN ? null : String(opacite))

/** Éléments repliables de l'interface. */
export type Repliable = 'panneau' | 'legende' | 'encarts'

/** État replié gardé ; à défaut, `parDefaut`. */
export function repliGarde(element: Repliable, parDefaut: boolean): boolean {
  const v = lire(`${element}-replie`)
  return v === null ? parDefaut : v === 'oui'
}

export const garderRepli = (element: Repliable, replie: boolean) => garder(`${element}-replie`, replie ? 'oui' : 'non')
