import { normaliser } from './chercher'

/** Adresse proposée par le géocodeur de la Géoplateforme (IGN), d'après la Base adresse nationale. */
export interface Adresse {
  /** Identifiant de la Base adresse nationale : clé des suggestions. */
  id: string
  /** « 12 Rue de la Paix 75002 Paris » */
  libelle: string
  /** « 12 Rue de la Paix » */
  nom: string
  /** « 75002 Paris » */
  precision: string
  /** Numéro (`housenumber`), voie (`street`) ou lieu-dit (`locality`). */
  type: 'housenumber' | 'street' | 'locality'
  lon: number
  lat: number
  /** Code INSEE de la commune au découpage en vigueur ; celui de l'arrondissement à Paris, Lyon et Marseille. */
  commune: string
}

export const GEOCODEUR = 'https://data.geopf.fr/geocodage/search'

const TYPES: readonly string[] = ['housenumber', 'street', 'locality'] satisfies Adresse['type'][]
const estType = (type: string): type is Adresse['type'] => TYPES.includes(type)

// Types de voie courants, sous leur forme normalisée (sans accents ni tirets).
const VOIE = new RegExp(`(^| )(${[
  'rue', 'avenue', 'av', 'boulevard', 'bd', 'chemin', 'allee', 'place', 'impasse', 'route', 'quai', 'cours', 'square',
  'voie', 'passage', 'sentier', 'lotissement', 'residence', 'hameau', 'lieu dit', 'cite', 'faubourg', 'rond point',
  'esplanade', 'promenade', 'parvis', 'villa', 'clos', 'chaussee', 'montee', 'ruelle', 'venelle', 'traverse', 'mail',
].join('|')})( |$)`)

/**
 * Un chiffre ou un type de voie : sans doute une adresse, à demander au géocodeur. Un nom de commune, même en
 * plusieurs mots (« la rochelle »), ou un code postal restent à l'index des territoires et ne quittent pas le
 * navigateur.
 */
export function ressembleAUneAdresse(texte: string): boolean {
  const t = normaliser(texte)
  if (t.length < 3 || !/\p{L}/u.test(t)) return false
  return /\d/.test(t) || VOIE.test(t)
}

interface ReponseGeocodeur {
  features?: { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> }[]
}

/** Adresses d'une réponse du géocodeur ; les communes entières restent à l'index des territoires. */
export function lireAdresses(reponse: ReponseGeocodeur): Adresse[] {
  const adresses: Adresse[] = []
  for (const f of reponse.features ?? []) {
    const p = f.properties ?? {}
    const texte = (cle: string) => {
      const v = p[cle]
      return typeof v === 'string' ? v : ''
    }
    const type = texte('type')
    const [lon, lat] = f.geometry?.coordinates ?? []
    if (!estType(type) || typeof lon !== 'number' || typeof lat !== 'number' || !texte('citycode')) continue
    adresses.push({
      id: texte('id') || texte('label'),
      libelle: texte('label'),
      nom: texte('name') || texte('label'),
      precision: [texte('postcode'), texte('city')].filter(Boolean).join(' '),
      type,
      lon,
      lat,
      commune: texte('citycode'),
    })
  }
  return adresses
}

export async function chercherAdresses(texte: string, signal?: AbortSignal): Promise<Adresse[]> {
  const parametres = new URLSearchParams({ q: texte.trim(), index: 'address', limit: '5', autocomplete: '1' })
  const reponse = await fetch(`${GEOCODEUR}?${parametres}`, { signal })
  if (!reponse.ok) throw new Error(`Géocodeur : réponse ${reponse.status}`)
  return lireAdresses(await reponse.json() as ReponseGeocodeur)
}
