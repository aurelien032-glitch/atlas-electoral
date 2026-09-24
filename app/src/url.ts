import { useCallback, useMemo, useSyncExternalStore } from 'react'

// L'URL est la source de vérité de la vue : chaque état est partageable par simple lien.
function abonner(rappel: () => void) {
  window.addEventListener('popstate', rappel)
  return () => window.removeEventListener('popstate', rappel)
}

const lireRecherche = () => window.location.search

/** Changements de paramètres : une valeur vide ou nulle retire le paramètre de l'URL. */
export type ChangementsUrl = Record<string, string | null | undefined>

export function useUrl(): [URLSearchParams, (changements: ChangementsUrl) => void] {
  const recherche = useSyncExternalStore(abonner, lireRecherche)
  const parametres = useMemo(() => new URLSearchParams(recherche), [recherche])
  const modifier = useCallback((changements: ChangementsUrl) => {
    const url = new URL(window.location.href)
    for (const [nom, valeur] of Object.entries(changements)) {
      if (valeur) url.searchParams.set(nom, valeur)
      else url.searchParams.delete(nom)
    }
    if (url.search === window.location.search) return
    window.history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])
  return [parametres, modifier]
}
