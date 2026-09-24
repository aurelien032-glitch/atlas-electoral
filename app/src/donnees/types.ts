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
  /**
   * Scrutins nationaux : territoires hors de la métropole (codes « 975 », « ZZ »…) qui votaient mais dont la
   * source ne contient aucun résultat (présidentielles 2002 et 2007, notamment).
   */
  territoires_absents?: string[]
}

export interface Catalogue {
  version: number
  genere_le: string
  /** Version de chaque source officielle lue au build (sources.lock.json). */
  sources: Record<string, { url: string; etag: string | null; derniere_modification: string | null }>
  scrutins: ScrutinCatalogue[]
}

/** Manifeste d'un scrutin (scrutin.json) : compteurs des contrôles et empreintes des fichiers. */
export interface Manifeste {
  id: string
  compteurs: Record<string, number | boolean>
  fichiers: Record<string, { octets: number; sha256: string }>
  duree_s: number
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
  niveau: 'commune' | 'arrondissement' | 'circonscription' | 'departement' | 'france'
  code: string
  /**
   * Municipales jusqu'en 2020 : exprimés des seules communes votant par listes, base des parts des
   * blocs (les voix multiples du panachage n'y sont pas comptées) ; absent pour les autres scrutins.
   */
  exprimes_listes?: number | null
  /** Commune (ou territoire en contenant une) où l'on vote pour des personnes (panachage). */
  panachage?: boolean | null
}

/** Base des parts des blocs : les exprimés des communes à listes quand le panachage est exclu. */
export const exprimesPourParts = (r: Pick<Resultat, 'exprimes'> & { exprimes_listes?: number | null }) =>
  r.exprimes_listes ?? r.exprimes

/**
 * Un tour dans la série d'un territoire (fichiers series/) : des comptes, dont les voix de chaque bloc,
 * vides quand le bloc n'avait pas de candidat. Les parts se calculent sur exprimes_listes, vide pour une
 * commune au panachage (aucune part).
 */
export type LigneSerie = {
  /** Absent des fichiers des communes. */
  niveau?: 'france' | 'departement' | 'circonscription' | 'arrondissement'
  code: string
  scrutin: string
  inscrits: number
  votants: number
  exprimes: number
  exprimes_listes: number | null
} & Record<Bloc, number | null>

/** Voix d'un candidat d'une commune au panachage (fichier par département, chargé à la demande). */
export interface VoixPanachage {
  code_bv: string
  commune: string
  cand: number
  nom: string | null
  prenom: string | null
  sexe: string | null
  nuance: string | null
  bloc: Bloc | null
  voix: number
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
  /** Arrondissement : Paris, Lyon et Marseille, dont les résultats viennent des numéros de bureau. */
  niveau: 'departement' | 'commune' | 'arrondissement' | 'circonscription'
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
  /** Libellé de la nuance dans la grille (« Rassemblement national »). */
  nuance_libelle: string | null
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

/** Encart de la carte nationale (geo/encarts.json) : chemins SVG précalculés, par code. */
export interface Encart {
  code: string
  nom: string
  largeur: number
  hauteur: number
  emprise: [number, number, number, number]
  communes: Record<string, string>
  circonscriptions: Record<string, string>
}

/** Code postal et commune du COG 2026 (base officielle de La Poste). */
export interface CodePostal {
  code_postal: string
  commune: string
}

/** Ancien code de commune (fusionnée depuis) → commune du COG 2026. */
export interface Passage {
  ancien: string
  actuel: string
  /** Fusion de communes (sinon, simple correction d'un code erroné : même territoire). */
  fusion: boolean
}
