import { BLOCS_COLORES, LIBELLE_BLOC, estColore, type BlocColore } from './carte/couleurs'
import { nomCandidature } from './donnees/libelles'
import type { Candidature, ScrutinCatalogue } from './donnees/types'

/** Ce que montre le mode Score : une candidature (scrutins nationaux) ou un bloc (tous les scrutins). */
export interface Cible {
  valeur: string
  libelle: string
  /** Teinte du dégradé : celle du bloc de la cible (décision du 24/09). */
  teinte: BlocColore | 'DIV'
  retenue: (cand: number) => boolean
  candidature?: Candidature
  bloc?: BlocColore
}

export function optionsCibles(scrutin: ScrutinCatalogue | undefined, candidats: readonly Candidature[] | undefined): Cible[] {
  if (!scrutin || !candidats) return []
  // Aux législatives et aux municipales, chaque candidature ne se présente que sur son territoire :
  // seul un bloc se compare d'un bout à l'autre de la carte.
  const candidatures: Cible[] = scrutin.portee !== 'national' ? [] : [...candidats]
    .sort((a, b) => b.voix_total - a.voix_total)
    .map((c) => ({
      valeur: `c${c.cand}`,
      libelle: nomCandidature(c),
      teinte: estColore(c.bloc) ? c.bloc : 'DIV',
      retenue: (cand: number) => cand === c.cand,
      candidature: c,
    }))
  const presents = new Set(candidats.map((c) => c.bloc))
  const blocs: Cible[] = BLOCS_COLORES.filter((b) => presents.has(b)).map((b) => ({
    valeur: `b${b}`,
    libelle: LIBELLE_BLOC[b],
    teinte: b,
    retenue: retenueDuBloc(candidats, b),
    bloc: b,
  }))
  return [...candidatures, ...blocs]
}

/** Filtre des candidatures d'un bloc, en temps constant : il est appelé sur chaque ligne de voix. */
export function retenueDuBloc(candidats: readonly Candidature[], bloc: BlocColore): (cand: number) => boolean {
  const cands = new Set(candidats.filter((c) => c.bloc === bloc).map((c) => c.cand))
  return (cand) => cands.has(cand)
}

/** Bloc de la candidature arrivée en tête au niveau national : bloc suivi par défaut en mode Évolution. */
export function blocEnTete(candidats: readonly Candidature[] | undefined): BlocColore | undefined {
  const tries = [...(candidats ?? [])].filter((c) => estColore(c.bloc)).sort((a, b) => b.voix_total - a.voix_total)
  const bloc = tries[0]?.bloc
  return bloc && estColore(bloc) ? bloc : undefined
}
