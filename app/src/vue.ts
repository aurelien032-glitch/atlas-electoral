import { BLOCS_COLORES, type BlocColore } from './carte/couleurs'
import { MODES, type Mode } from './modes'

export type NiveauSelection = 'bureau' | 'commune' | 'arrondissement' | 'circonscription' | 'departement'

/** Territoire sélectionné (clic sur la carte ou fil d'Ariane). */
export interface Selection {
  niveau: NiveauSelection
  code: string
}

/** Vue courante, lue dans l'URL : chaque état de l'atlas se partage par un lien. */
export interface Vue {
  scrutin: string | undefined
  mode: Mode
  /** Mode Score : « c12 » pour la candidature 12, « bEXD » pour un bloc. */
  cible: string | undefined
  /** Mode Évolution : bloc suivi et scrutin de départ (le scrutin courant est l'arrivée). */
  bloc: BlocColore | undefined
  de: string | undefined
  selection: Selection | undefined
  /** Page affichée dans le panneau à la place des résultats. */
  page: 'methodologie' | undefined
}

const NIVEAUX: readonly NiveauSelection[] = ['bureau', 'commune', 'arrondissement', 'circonscription', 'departement']

export function lireVue(parametres: URLSearchParams): Vue {
  const [niveau, code] = (parametres.get('sel') ?? '').split(':')
  return {
    scrutin: parametres.get('scrutin') ?? undefined,
    mode: MODES.find((m) => m === parametres.get('mode')) ?? 'tete',
    cible: parametres.get('cible') ?? undefined,
    bloc: BLOCS_COLORES.find((b) => b === parametres.get('bloc')),
    de: parametres.get('de') ?? undefined,
    selection: code && NIVEAUX.includes(niveau as NiveauSelection) ? { niveau: niveau as NiveauSelection, code } : undefined,
    page: parametres.get('page') === 'methodologie' ? 'methodologie' : undefined,
  }
}

export const ecrireSelection = (s: Selection | undefined) => (s ? `${s.niveau}:${s.code}` : null)

/** Cadrage de la carte, porté par le fragment de l'URL : « #11.2/45.7641/4.8357 » (zoom, latitude, longitude). */
export interface Cadre {
  zoom: number
  /** [longitude, latitude], dans l'ordre de MapLibre. */
  centre: [number, number]
}

const FRAGMENT_CADRE = /^#(\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/

export function lireCadre(fragment: string): Cadre | null {
  const m = FRAGMENT_CADRE.exec(fragment)
  if (!m) return null
  const [zoom, lat, lon] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return zoom <= 24 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { zoom, centre: [lon, lat] } : null
}

/** Fragment d'un cadrage, précis à un pixel près environ (même règle que MapLibre). */
export function ecrireCadre({ zoom, centre: [lon, lat] }: Cadre): string {
  const z = Math.round(zoom * 100) / 100
  const m = 10 ** Math.max(0, Math.ceil((z * Math.LN2 + Math.log(512 / 360 / 0.5)) / Math.LN10))
  return `#${z}/${Math.round(lat * m) / m}/${Math.round(lon * m) / m}`
}
