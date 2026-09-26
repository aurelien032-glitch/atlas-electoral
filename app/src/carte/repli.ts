import { arrondissementDu } from '../donnees/territoires'
import type { Bureau, BureauContour, SourceCorrectif } from '../donnees/types'

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
  /** Territoires sans aucun contour : au zoom des bureaux, leur contour détaillé est dessiné (communes_sans_contour). */
  sansDessin: ReadonlySet<string>
  /** Carte au bureau : territoires aux bureaux renumérotés, montrés en entier à la commune. */
  aLaCommune: ReadonlySet<string>
  /** Carte au bureau : bureaux sans contour, par territoire (seulement ceux qui en ont). */
  sansContour: ReadonlyMap<string, SansContour>
  /**
   * Territoires dessinés par leur découpage local, leurs contours de 2022 effacés : aux numéros du scrutin sur une
   * carte au bureau (Bordeaux Métropole…), et à tout scrutin ceux dont les contours de 2022 sont faux.
   */
  corriges: ReadonlySet<string>
  /** Territoire de chaque contour local. */
  territoireDuCorrectif: ReadonlyMap<string, string>
}

/** Part des bureaux d'un territoire que son découpage local doit porter pour le dessiner à ce scrutin. */
export const SEUIL_CORRECTIF = 0.9

const territoireDe = (codeBv: string, commune: string) => arrondissementDu(codeBv) ?? commune
// Paris, Lyon et Marseille : la ville n'est jamais peinte, ses arrondissements le sont.
const VILLES_DECOUPEES = new Set(['75056', '69123', '13055'])

/** Territoire de chaque contour : calculé une fois, les contours ne changent pas d'un scrutin à l'autre. */
export const territoiresDesContours = (contours: readonly BureauContour[]): ReadonlyMap<string, string> =>
  new Map(contours.map((c) => [c.code_bv, territoireDe(c.code_bv, c.code_commune)]))

/** Territoire de chaque contour local (numéro de bureau « commune_numéro »). */
export const territoiresDesCorrectifs = (codes: Iterable<string>): ReadonlyMap<string, string> =>
  new Map([...codes].map((code) => [code, territoireDe(code, code.split('_')[0])]))

/**
 * Territoires que leur découpage local peut dessiner à un scrutin de cette année : pas avant l'année de la source,
 * même si les numéros concordent (le 1er arrondissement de Paris a gardé les siens en 2024, pas forcément ses limites).
 */
export const territoiresDesSources = (sources: readonly SourceCorrectif[], annee: number): ReadonlySet<string> =>
  new Set(sources.filter((s) => s.depuis <= annee).flatMap((s) => s.territoires))

/** Territoires aux contours de 2022 faux, que leur découpage local dessine à tout scrutin. */
export const territoiresRemplaces = (sources: readonly SourceCorrectif[]): ReadonlySet<string> =>
  new Set(sources.flatMap((s) => s.remplace))

/**
 * Territoires (communes, arrondissements) qui n'ont aucun contour. Calculé sur tous les territoires, pas sur ceux d'un
 * scrutin : la couche qui les dessine se filtre sur eux, et changer ce filtre recharge toutes les communes.
 */
export function territoiresSansDessin(
  territoireDuContour: ReadonlyMap<string, string>,
  territoires: Iterable<{ niveau: string; code: string }>,
): ReadonlySet<string> {
  const dessines = new Set(territoireDuContour.values())
  const codes: string[] = []
  for (const t of territoires) {
    if ((t.niveau === 'commune' || t.niveau === 'arrondissement') && !dessines.has(t.code) && !VILLES_DECOUPEES.has(t.code)) codes.push(t.code)
  }
  return new Set(codes.sort())
}

/**
 * Repli d'un scrutin. Les bureaux ne sont fournis que pour une carte au bureau ; `communeDu` donne la commune d'un
 * bureau au découpage des contours et des agrégats (COG 2026) ; `valables`, les territoires que leur découpage local
 * peut dessiner à ce scrutin (territoiresDesSources) ; `remplaces`, ceux qu'il dessine toujours (territoiresRemplaces).
 */
export function repli(
  territoireDuContour: ReadonlyMap<string, string>,
  sansDessin: ReadonlySet<string>,
  bureaux: readonly Bureau[] | null,
  communeDu: (codeBv: string) => string,
  territoireDuCorrectif: ReadonlyMap<string, string> = new Map(),
  valables: ReadonlySet<string> = new Set(territoireDuCorrectif.values()),
  remplaces: ReadonlySet<string> = new Set(),
): Repli {
  const locaux = new Set([...territoireDuCorrectif.values()].filter((t) => valables.has(t) || remplaces.has(t)))
  const parTerritoire = new Map<string, SansContour>()
  // Territoires qui ont un découpage local : leurs bureaux absents de ce découpage.
  const horsCorrectif = new Map<string, { bureaux: number; inscrits: number }>()
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
    if (locaux.has(territoire) && !territoireDuCorrectif.has(b.code_bv)) {
      const h = horsCorrectif.get(territoire) ?? { bureaux: 0, inscrits: 0 }
      h.bureaux++
      h.inscrits += b.inscrits
      horsCorrectif.set(territoire, h)
    }
  }
  // Découpage local aux numéros du scrutin (presque tous ses bureaux y figurent), ou à la place de contours de 2022
  // faux : il dessine le territoire, et ce qui manque se mesure sur lui.
  const corriges = new Set<string>()
  if (bureaux === null) {
    // Carte à la commune : les numéros n'y comptent pas ; seuls les contours de 2022 faux cèdent la place au découpage
    // local, à la couleur de la commune.
    for (const territoire of territoireDuCorrectif.values()) if (remplaces.has(territoire)) corriges.add(territoire)
  }
  for (const territoire of bureaux === null ? [] : locaux) {
    const s = parTerritoire.get(territoire)
    const h = horsCorrectif.get(territoire) ?? { bureaux: 0, inscrits: 0 }
    const auxNumeros = s !== undefined && s.bureauxTotal - h.bureaux >= SEUIL_CORRECTIF * s.bureauxTotal
    if (!auxNumeros && !remplaces.has(territoire)) continue
    corriges.add(territoire)
    if (s) {
      s.bureaux = h.bureaux
      s.inscrits = h.inscrits
    }
  }
  const sansContour = new Map([...parTerritoire].filter(([, s]) => s.bureaux > 0))
  const aLaCommune = new Set([...sansContour]
    .filter(([, s]) => s.inscrits > SEUIL_RENUMEROTATION * s.inscritsTotal || s.bureaux === s.bureauxTotal)
    .map(([territoire]) => territoire))
  return { territoireDuContour, sansDessin, aLaCommune, sansContour, corriges, territoireDuCorrectif }
}
