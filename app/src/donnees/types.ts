/** Blocs de la grille du ministère (circulaire de février 2026), plus « non classé ». */
export type Bloc = 'EXG' | 'GAU' | 'CENT' | 'DTE' | 'EXD' | 'DIV' | 'NC'

export type NiveauCarte = 'bureau' | 'commune'

export interface ScrutinCatalogue {
  id: string
  libelle: string
  date: string
  /** Territoire où se présente une candidature : la France, une circonscription ou une commune. */
  portee: 'national' | 'circonscription' | 'commune'
  totaux: { inscrits: number; votants: number; blancs: number | null; nuls: number; exprimes: number }
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
  /** Null jusqu'en 2015 : les blancs sont alors comptés avec les nuls. */
  blancs: number | null
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
  niveau: 'commune' | 'circonscription' | 'departement' | 'france'
  code: string
}

/** Voix d'une candidature dans un bureau (voix.parquet). */
export interface VoixBureau {
  code_bv: string
  cand: number
  voix: number
}

/** Voix d'une candidature dans un territoire agrégé (agregats_voix.parquet). */
export interface VoixAgregat {
  niveau: Agregat['niveau']
  code: string
  cand: number
  voix: number
}

/** Département ou commune du découpage 2026 : nom et emprise (geo/territoires.parquet). */
export interface Territoire {
  niveau: 'departement' | 'commune' | 'circonscription'
  code: string
  nom: string
  departement: string
  ouest: number | null
  sud: number | null
  est: number | null
  nord: number | null
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
  sexe: string | null
  /** Législatives : circonscription (« 69-02 ») et élection à ce tour. */
  circonscription: string | null
  elu: boolean | null
  voix_total: number
}

/** Circonscription législative : libellé (« Rhône, 2e circonscription ») et emprise approchée. */
export interface Circonscription {
  code: string
  libelle: string
  departement: string
  ouest: number | null
  sud: number | null
  est: number | null
  nord: number | null
}

/** Ancien code de commune (fusionnée depuis) → commune du COG 2026. */
export interface Passage {
  ancien: string
  actuel: string
}
