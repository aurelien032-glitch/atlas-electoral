import { COULEUR_BLOC, GRIS, estColore, type BlocColore } from '../carte/couleurs'
import type { Repli } from '../carte/repli'
import type { Index } from '../donnees/territoires'
import type { Agregat, Bloc, Candidature, ScrutinCatalogue, VoixAgregat } from '../donnees/types'
import type { Selection } from '../vue'

/** Données du scrutin courant, partagées par les panneaux. */
export interface Contexte {
  scrutin: ScrutinCatalogue
  scrutins: ScrutinCatalogue[]
  agregats: Agregat[]
  candidats: Candidature[]
  parCand: Map<number, Candidature>
  agregatsVoix: VoixAgregat[] | undefined
  index: Index
  /** Ce que la carte montre à la commune faute de contour de bureau (null tant que les contours n'ont pas été lus). */
  repli: Repli | null
}

/** Ce que l'utilisateur peut changer depuis le panneau. */
export interface Actions {
  scrutin: (id: string) => void
  cible: (valeur: string) => void
  bloc: (bloc: BlocColore) => void
  de: (id: string) => void
  /** Sélectionne un territoire et cadre la carte dessus ; undefined revient à la France entière. */
  territoire: (selection: Selection | undefined) => void
}

export function couleurDuBloc(bloc: Bloc): string {
  if (estColore(bloc)) return COULEUR_BLOC[bloc]
  return bloc === 'DIV' ? GRIS.divers : GRIS.nonClasse
}

export const pluriel = (n: number, mot: string) => `${mot}${n > 1 ? 's' : ''}`

/** Évolution vers le premier scrutin de l'atlas : rien à comparer. */
export const SANS_DEPART = "Aucun scrutin de l'atlas ne précède celui-ci : choisissez un scrutin d'arrivée plus récent."
