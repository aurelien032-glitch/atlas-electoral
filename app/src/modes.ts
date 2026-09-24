import { seuilsLisibles } from './calculs/classes'
import { ecartsEnPoints, parts, voixParTerritoire, type Mesure } from './calculs/parts'
import { etatClasse, etatTete, type Etat } from './carte/etats'
import { exprimesPourParts, type Agregat, type Bloc, type Bureau, type Resultat, type VoixAgregat, type VoixBureau } from './donnees/types'
import { avecPourcent, formatSeuil } from './format'

export const MODES = ['tete', 'score', 'participation', 'evolution'] as const
export type Mode = (typeof MODES)[number]
export const LIBELLE_MODE: Record<Mode, string> = {
  tete: 'En tête',
  score: 'Score',
  participation: 'Participation',
  evolution: 'Évolution',
}

/** Valeurs d'une carte en classes : par commune, et par bureau quand la carte descend au bureau. */
export interface Valeurs {
  communes: Map<string, Mesure>
  bureaux: Map<string, Mesure> | null
  /** Législatives : valeurs par circonscription, pour la vue nationale. */
  circonscriptions?: Map<string, Mesure>
  /** Paris, Lyon et Marseille : valeurs par arrondissement, dessinés par-dessus leur ville. */
  arrondissements?: Map<string, Mesure>
}

/** États à appliquer sur la carte. Sans bureaux, chaque bureau prend l'état de sa commune. */
export interface Coloriage {
  communes: Map<string, Etat>
  bureaux: Map<string, Etat> | null
  /** Législatives : la vue nationale colore les circonscriptions plutôt que les communes. */
  circonscriptions?: Map<string, Etat>
  arrondissements?: Map<string, Etat>
}

/** Part (0 à 1) des candidatures retenues dans chaque territoire d'un niveau d'agrégation. */
export function partsAuNiveau(
  agregats: readonly Agregat[],
  voix: readonly VoixAgregat[],
  niveau: Agregat['niveau'],
  retenue: (cand: number) => boolean,
): Map<string, Mesure> {
  const exprimes = new Map(agregats.filter((a) => a.niveau === niveau).map((a) => [a.code, exprimesPourParts(a)]))
  return parts(voixParTerritoire(voix, (l) => (l.niveau === niveau ? l.code : undefined), retenue), exprimes)
}

/** Part (0 à 1) des candidatures retenues dans un seul territoire agrégé ; undefined sans suffrage exprimé. */
export function partDe(
  agregats: readonly Agregat[],
  voix: readonly VoixAgregat[],
  niveau: Agregat['niveau'],
  code: string,
  retenue: (cand: number) => boolean,
): Mesure | undefined {
  const agregat = agregats.find((a) => a.niveau === niveau && a.code === code)
  if (!agregat || exprimesPourParts(agregat) <= 0) return undefined
  let somme: number | undefined
  for (const v of voix) {
    if (v.niveau === niveau && v.code === code && retenue(v.cand)) somme = (somme ?? 0) + v.voix
  }
  return somme === undefined ? null : somme / exprimesPourParts(agregat)
}

/** Part (0 à 1) des candidatures retenues dans chaque bureau. */
export function partsBureaux(bureaux: readonly Bureau[], voix: readonly VoixBureau[], retenue: (cand: number) => boolean) {
  const exprimes = new Map(bureaux.map((b) => [b.code_bv, b.exprimes]))
  return parts(voixParTerritoire(voix, (l) => l.code_bv, retenue), exprimes)
}

const enPoints = (m: Map<string, Mesure>) => new Map([...m].map(([code, v]) => [code, v === null ? null : 100 * v]))

/** Score des candidatures retenues, en points. Les bureaux ne sont calculés que si leurs voix sont fournies. */
export function valeursScore(
  agregats: readonly Agregat[],
  agregatsVoix: readonly VoixAgregat[],
  bureaux: { liste: readonly Bureau[]; voix: readonly VoixBureau[] } | null,
  retenue: (cand: number) => boolean,
): Valeurs {
  return {
    communes: enPoints(partsAuNiveau(agregats, agregatsVoix, 'commune', retenue)),
    bureaux: bureaux && enPoints(partsBureaux(bureaux.liste, bureaux.voix, retenue)),
    circonscriptions: enPoints(partsAuNiveau(agregats, agregatsVoix, 'circonscription', retenue)),
    arrondissements: enPoints(partsAuNiveau(agregats, agregatsVoix, 'arrondissement', retenue)),
  }
}

/** Participation (votants sur inscrits), en points. */
export function tauxParticipation(r: Resultat): number | undefined {
  return r.inscrits > 0 ? (100 * r.votants) / r.inscrits : undefined
}

export function valeursParticipation(agregats: readonly Agregat[], bureaux: readonly Bureau[] | null): Valeurs {
  const taux = <T extends Resultat>(lignes: readonly T[], code: (l: T) => string) => {
    const m = new Map<string, Mesure>()
    for (const l of lignes) {
      const t = tauxParticipation(l)
      if (t !== undefined) m.set(code(l), t)
    }
    return m
  }
  return {
    communes: taux(agregats.filter((a) => a.niveau === 'commune'), (a) => a.code),
    bureaux: bureaux && taux(bureaux, (b) => b.code_bv),
    circonscriptions: taux(agregats.filter((a) => a.niveau === 'circonscription'), (a) => a.code),
    arrondissements: taux(agregats.filter((a) => a.niveau === 'arrondissement'), (a) => a.code),
  }
}

/** Données d'un scrutin pour le mode Évolution : ses agrégats et le bloc retenu. */
export interface DonneesEvolution {
  agregats: readonly Agregat[]
  agregatsVoix: readonly VoixAgregat[]
  retenue: (cand: number) => boolean
}

/** Écart de la part d'un bloc entre deux scrutins, en points, au niveau demandé. */
export function ecartsAuNiveau(avant: DonneesEvolution, apres: DonneesEvolution, niveau: Agregat['niveau']): Map<string, Mesure> {
  return ecartsEnPoints(
    partsAuNiveau(avant.agregats, avant.agregatsVoix, niveau, avant.retenue),
    partsAuNiveau(apres.agregats, apres.agregatsVoix, niveau, apres.retenue),
  )
}

// Les bureaux changent de numéro d'un scrutin à l'autre : l'évolution se lit à la commune.
export function valeursEvolution(avant: DonneesEvolution, apres: DonneesEvolution): Valeurs {
  return {
    communes: ecartsAuNiveau(avant, apres, 'commune'),
    bureaux: null,
    arrondissements: ecartsAuNiveau(avant, apres, 'arrondissement'),
  }
}

/** Seuils lisibles d'une carte en classes, pondérés par les électeurs de chaque territoire. */
export function seuilsDe(valeurs: ReadonlyMap<string, Mesure>, poids: ReadonlyMap<string, number>): number[] {
  const v: number[] = []
  const p: number[] = []
  for (const [code, x] of valeurs) {
    if (x === null) continue
    v.push(x)
    p.push(poids.get(code) ?? 0)
  }
  return seuilsLisibles(v, p)
}

/** Couleurs d'une rampe pour moins de classes qu'elle n'a de marches : réparties sur toute la rampe. */
export function couleursPour(rampe: readonly string[], classes: number): string[] {
  if (classes >= rampe.length) return [...rampe]
  if (classes <= 1) return [rampe[Math.floor(rampe.length / 2)]]
  return Array.from({ length: classes }, (_, i) => rampe[Math.round((i * (rampe.length - 1)) / (classes - 1))])
}

export function coloriageClasses(valeurs: Valeurs, seuils: readonly number[], couleurs: readonly string[]): Coloriage {
  const etats = (m: Map<string, Mesure>) => new Map([...m].map(([code, v]) => [code, etatClasse(v, seuils, couleurs)]))
  return {
    communes: etats(valeurs.communes),
    bureaux: valeurs.bureaux && etats(valeurs.bureaux),
    circonscriptions: valeurs.circonscriptions && etats(valeurs.circonscriptions),
    arrondissements: valeurs.arrondissements && etats(valeurs.arrondissements),
  }
}

export function coloriageTete(agregats: readonly Agregat[], bureaux: readonly Bureau[] | null, blocDe: (cand: number) => Bloc): Coloriage {
  const etats = <T extends Resultat>(lignes: readonly T[], code: (l: T) => string) => {
    const m = new Map<string, Etat>()
    for (const l of lignes) {
      const etat = etatTete(l, blocDe)
      if (etat) m.set(code(l), etat)
    }
    return m
  }
  return {
    communes: etats(agregats.filter((a) => a.niveau === 'commune'), (a) => a.code),
    bureaux: bureaux && etats(bureaux, (b) => b.code_bv),
    circonscriptions: etats(agregats.filter((a) => a.niveau === 'circonscription'), (a) => a.code),
    arrondissements: etats(agregats.filter((a) => a.niveau === 'arrondissement'), (a) => a.code),
  }
}

export interface ClasseLegende {
  couleur: string
  libelle: string
  nombre: number
}

/** Classes de la légende, de la plus haute à la plus basse, avec le nombre de territoires de chacune. */
export function classesLegende(
  valeurs: ReadonlyMap<string, Mesure>,
  seuils: readonly number[],
  couleurs: readonly string[],
  libelles: readonly string[] = libellesPourcent(seuils),
): { classes: ClasseLegende[]; sansObjet: number } {
  const nombres = couleurs.map(() => 0)
  let sansObjet = 0
  for (const v of valeurs.values()) {
    if (v === null) sansObjet++
    else nombres[seuils.filter((s) => v >= s).length]++
  }
  const classes = couleurs.map((couleur, i) => ({ couleur, libelle: libelles[i], nombre: nombres[i] }))
  return { classes: classes.reverse(), sansObjet }
}

/** « moins de 15 % », « 15 à 20 % »… « 30 % et plus ». */
export function libellesPourcent(seuils: readonly number[]): string[] {
  if (seuils.length === 0) return ['toutes valeurs']
  const s = seuils.map(formatSeuil)
  return [
    `moins de ${avecPourcent(s[0])}`,
    ...s.slice(1).map((haut, i) => `${s[i]} à ${avecPourcent(haut)}`),
    `${avecPourcent(s[s.length - 1])} et plus`,
  ]
}

export const LIBELLES_EVOLUTION = [
  'moins de −10',
  '−10 à −5',
  '−5 à −1',
  'stable, −1 à +1',
  '+1 à +5',
  '+5 à +10',
  '+10 ou plus',
] as const
