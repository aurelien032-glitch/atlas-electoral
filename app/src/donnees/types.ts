/** Blocs de la grille du ministère (circulaire de février 2026), plus « non classé ». */
export type Bloc = 'EXG' | 'GAU' | 'CENT' | 'DTE' | 'EXD' | 'DIV' | 'NC'

export type NiveauCarte = 'bureau' | 'commune'

export interface ScrutinCatalogue {
  id: string
  libelle: string
  date: string
  portee: 'national' | 'departement' | 'commune'
  totaux: { inscrits: number; votants: number; blancs: number; nuls: number; exprimes: number }
  jointure_contours: {
    millesime_contours: number
    taux_inscrits_metropole: number
    niveau_carte: NiveauCarte
  } | null
}

export interface Catalogue {
  version: number
  genere_le: string
  scrutins: ScrutinCatalogue[]
}

/** Résultat précalculé d'un territoire (bureau ou agrégat) : participation et candidature en tête. */
export interface Resultat {
  inscrits: number
  votants: number
  blancs: number
  nuls: number
  exprimes: number
  tete: number | null
  egalite: boolean
  /** Avance de la tête sur la deuxième candidature, en dix-millièmes des exprimés (500 = 5 points). */
  avance_x10000: number | null
}

export interface Bureau extends Resultat {
  code_bv: string
}

/** Bureau présent dans les contours officiels (millésime 2022), avec sa commune. */
export interface BureauContour {
  code_bv: string
  code_commune: string
  code_circonscription: string | null
}

export interface Agregat extends Resultat {
  niveau: 'commune' | 'departement' | 'france'
  code: string
}

export interface Candidature {
  cand: number
  portee: string
  panneau: number | null
  nom: string | null
  prenom: string | null
  liste: string | null
  liste_abregee: string | null
  nuance: string
  origine_nuance: 'officielle' | 'attribuée' | 'aucune'
  famille: string
  bloc: Bloc
  cas_limite: boolean
  voix_total: number
}
