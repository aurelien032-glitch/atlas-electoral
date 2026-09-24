import { useCallback, useSyncExternalStore } from 'react'

// L'URL est la source de vérité de la vue : chaque état est partageable par simple lien.
function abonner(rappel: () => void) {
  window.addEventListener('popstate', rappel)
  return () => window.removeEventListener('popstate', rappel)
}

export function useParametreUrl(nom: string): [string | undefined, (valeur: string) => void] {
  const valeur = useSyncExternalStore(abonner, () => new URLSearchParams(window.location.search).get(nom) ?? undefined)
  const modifier = useCallback(
    (nouvelle: string) => {
      const url = new URL(window.location.href)
      url.searchParams.set(nom, nouvelle)
      window.history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [nom],
  )
  return [valeur, modifier]
}
