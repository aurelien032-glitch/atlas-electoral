import { scrutinParDefaut } from './donnees/scrutins'
import type { ScrutinCatalogue } from './donnees/types'
import type { Vue } from './vue'

export const SITE = 'https://atlas-electoral.pages.dev'

const DATE_LONGUE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Adresse que les moteurs de recherche retiennent pour la vue : toutes ses variantes (territoire choisi, mode,
 * cadrage) se rattachent à la vue nationale du scrutin, et le scrutin par défaut à l'accueil. Le plan du site
 * (`construire`) ne liste que ces adresses.
 */
export function adresseCanonique(page: Vue['page'], scrutin: ScrutinCatalogue | undefined, scrutins: readonly ScrutinCatalogue[]): string | undefined {
  if (page === 'methodologie') return `${SITE}/?page=methodologie`
  if (!scrutin) return undefined
  return scrutin.id === scrutinParDefaut(scrutins)?.id ? `${SITE}/` : `${SITE}/?scrutin=${scrutin.id}`
}

/** Description de la vue pour les résultats de recherche ; aucune pour l'accueil, qui garde celle d'index.html. */
export function descriptionDe(page: Vue['page'], scrutin: ScrutinCatalogue | undefined, scrutins: readonly ScrutinCatalogue[]): string | undefined {
  if (page === 'methodologie') {
    return "Méthodologie de l'Atlas électoral : sources officielles, classement des nuances en blocs, qualité des données, limites connues, code, licences et mentions légales."
  }
  if (!scrutin || scrutin.id === scrutinParDefaut(scrutins)?.id) return undefined
  const jusquAuBureau = scrutin.jointure_contours?.niveau_carte === 'bureau' ? ' et au bureau de vote' : ''
  return `${scrutin.libelle} (${DATE_LONGUE.format(new Date(`${scrutin.date}T00:00:00Z`))}) : résultats officiels, de la France entière à la commune${jusquAuBureau}. Participation, voix et parts de chaque candidature.`
}

/** Pose le lien canonique et la description de la vue (Google exécute le JavaScript et lit le résultat). */
export function poserReferencement(canonique: string | undefined, description: string | undefined) {
  let lien = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (canonique) {
    if (!lien) {
      lien = document.createElement('link')
      lien.rel = 'canonical'
      document.head.append(lien)
    }
    lien.href = canonique
  } else {
    lien?.remove()
  }
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (!meta) return
  // La description d'index.html, mémorisée avant la première modification, est celle de l'accueil.
  if (meta.dataset.accueil === undefined) meta.dataset.accueil = meta.content
  meta.content = description ?? meta.dataset.accueil
}
