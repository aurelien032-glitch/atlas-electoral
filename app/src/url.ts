import { useCallback, useMemo, useSyncExternalStore } from 'react'

// L'URL est la source de vérité de la vue : chaque état est partageable par simple lien.
function abonner(rappel: () => void) {
  window.addEventListener('popstate', rappel)
  return () => window.removeEventListener('popstate', rappel)
}

const lireRecherche = () => window.location.search

/** Changements de paramètres : une valeur vide ou nulle retire le paramètre de l'URL. */
export type ChangementsUrl = Record<string, string | null | undefined>

/** Change l'URL ; `remplacer` précise la vue courante sans créer d'entrée d'historique. */
export type ModifierUrl = (changements: ChangementsUrl, remplacer?: boolean) => void

export function useUrl(): [URLSearchParams, ModifierUrl] {
  const recherche = useSyncExternalStore(abonner, lireRecherche)
  const parametres = useMemo(() => new URLSearchParams(recherche), [recherche])
  const modifier = useCallback<ModifierUrl>((changements, remplacer = false) => {
    const url = new URL(window.location.href)
    for (const [nom, valeur] of Object.entries(changements)) {
      if (valeur) url.searchParams.set(nom, valeur)
      else url.searchParams.delete(nom)
    }
    if (url.search === window.location.search) return
    if (remplacer) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])
  return [parametres, modifier]
}
