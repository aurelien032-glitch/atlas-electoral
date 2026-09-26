import { arrondissementDu, villeDe } from '../donnees/territoires'
import type { Agregat, Bureau, BureauContour } from '../donnees/types'

/**
 * Au-delà de cette part de leurs inscrits sans contour, les bureaux d'un territoire ont changé de numéro depuis 2022
 * (Bordeaux en 2024) : ceux qui en gardent un désignent peut-être un autre quartier. Il se lit alors en entier.
 */
export const SEUIL_RENUMEROTATION = 0.5

/** Bureaux d'un territoire absents des contours de 2022, parmi tous les siens. */
export interface SansContour {
  bureaux: number
  inscrits: number
  bureauxTotal: number
  inscritsTotal: number
}

/**
 * Ce que la carte montre à la commune (ou à l'arrondissement), faute de contour de bureau : les contours de 2022
 * manquent pour quelques villes (Troyes, Belfort…) et ne suivent pas les bureaux créés ou renumérotés depuis.
 */
export interface Repli {
  /** Territoire de chaque contour de 2022 : l'arrondissement à Paris, Lyon et Marseille, sinon la commune. */
  territoireDuContour: ReadonlyMap<string, string>
  /** Territoires sans aucun contour : au zoom des bureaux, c'est leur commune qui est dessinée. */
  sansDessin: ReadonlySet<string>
  /** Carte au bureau : territoires aux bureaux renumérotés, montrés en entier à la commune. */
  aLaCommune: ReadonlySet<string>
  /** Carte au bureau : bureaux sans contour, par territoire (seulement ceux qui en ont). */
  sansContour: ReadonlyMap<string, SansContour>
}

const territoireDe = (codeBv: string, commune: string) => arrondissementDu(codeBv) ?? commune

/** Territoire de chaque contour : calculé une fois, les contours ne changent pas d'un scrutin à l'autre. */
export const territoiresDesContours = (contours: readonly BureauContour[]): ReadonlyMap<string, string> =>
  new Map(contours.map((c) => [c.code_bv, territoireDe(c.code_bv, c.code_commune)]))

/**
 * Repli d'un scrutin. Les bureaux ne sont fournis que pour une carte au bureau ; `communeDu` donne la commune d'un
 * bureau au découpage des contours et des agrégats (COG 2026).
 */
export function repli(
  territoireDuContour: ReadonlyMap<string, string>,
  agregats: readonly Agregat[],
  bureaux: readonly Bureau[] | null,
  communeDu: (codeBv: string) => string,
): Repli {
  const dessines = new Set(territoireDuContour.values())
  // Paris, Lyon et Marseille : la ville n'est jamais peinte, ses arrondissements le sont.
  const decoupees = new Set<string>(agregats.filter((a) => a.niveau === 'arrondissement').map((a) => villeDe(a.code)))
  const sansDessin = new Set(agregats
    .filter((a) => (a.niveau === 'commune' || a.niveau === 'arrondissement') && !dessines.has(a.code) && !decoupees.has(a.code))
    .map((a) => a.code))

  const parTerritoire = new Map<string, SansContour>()
  for (const b of bureaux ?? []) {
    const territoire = territoireDe(b.code_bv, communeDu(b.code_bv))
    const s = parTerritoire.get(territoire) ?? { bureaux: 0, inscrits: 0, bureauxTotal: 0, inscritsTotal: 0 }
    s.bureauxTotal++
    s.inscritsTotal += b.inscrits
    if (!territoireDuContour.has(b.code_bv)) {
      s.bureaux++
      s.inscrits += b.inscrits
    }
    parTerritoire.set(territoire, s)
  }
  const sansContour = new Map([...parTerritoire].filter(([, s]) => s.bureaux > 0))
  const aLaCommune = new Set([...sansContour]
    .filter(([, s]) => s.inscrits > SEUIL_RENUMEROTATION * s.inscritsTotal || s.bureaux === s.bureauxTotal)
    .map(([territoire]) => territoire))
  return { territoireDuContour, sansDessin, aLaCommune, sansContour }
}
