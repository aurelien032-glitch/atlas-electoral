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
