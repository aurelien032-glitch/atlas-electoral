import type { MouseEvent } from 'react'

export const DEPOT = 'https://github.com/aurelien032-glitch/atlas-electoral'

/** Ticket de signalement (formulaire `.github/ISSUE_TEMPLATE/erreur.yml`), la vue et son titre déjà remplis. */
export function adresseSignalement(lien: string, titre: string): string {
  const parametres = new URLSearchParams({ template: 'erreur.yml', title: `Erreur : ${titre}`, lien })
  return `${DEPOT}/issues/new?${parametres}`
}

// Lue au clic : la carte réécrit le cadrage de l'adresse sans nouveau rendu du panneau.
const signalementDeLaVue = () =>
  adresseSignalement(window.location.href, document.title.replace(/ · Atlas électoral$/, ''))

/** Lien « Signaler une erreur » : ouvre, dans un nouvel onglet, un ticket public sur le dépôt du projet. */
export function Signaler({ texte }: { texte: string }) {
  const actualiser = (e: MouseEvent<HTMLAnchorElement>) => { e.currentTarget.href = signalementDeLaVue() }
  return (
    <a className="lien" href={signalementDeLaVue()} target="_blank" rel="noreferrer" onClick={actualiser} onAuxClick={actualiser}>
      {/* Virgule et non espace en tête : l'espace d'un texte masqué disparaît du nom lu (« erreur(ticket »). */}
      {texte}<span className="visuellement-cache">, ticket GitHub, nouvel onglet</span>
    </a>
  )
}
