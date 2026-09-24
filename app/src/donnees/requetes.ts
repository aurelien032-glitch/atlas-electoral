import { useQuery } from '@tanstack/react-query'
import { lireParquet } from './parquet'
import type { Agregat, Bureau, BureauContour, Candidature, Catalogue } from './types'

/** Racine des fichiers publiés par le pipeline (servis sous /data en développement, cf. vite.config.ts). */
export const RACINE_DONNEES = `${import.meta.env.BASE_URL}data/v1`

export function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue'],
    queryFn: async ({ signal }) => {
      const reponse = await fetch(`${RACINE_DONNEES}/scrutins.json`, { signal })
      if (!reponse.ok) throw new Error(`catalogue indisponible (HTTP ${reponse.status})`)
      return (await reponse.json()) as Catalogue
    },
  })
}

function useFichier<T>(scrutin: string | undefined, fichier: string) {
  return useQuery({
    queryKey: ['scrutin', scrutin, fichier],
    enabled: scrutin !== undefined,
    queryFn: ({ signal }) => lireParquet<T>(`${RACINE_DONNEES}/${scrutin}/${fichier}`, signal),
  })
}

export const useBureaux = (scrutin?: string) => useFichier<Bureau>(scrutin, 'bureaux.parquet')
export const useAgregats = (scrutin?: string) => useFichier<Agregat>(scrutin, 'agregats.parquet')
export const useCandidats = (scrutin?: string) => useFichier<Candidature>(scrutin, 'candidats.parquet')

/** Bureaux des contours officiels et leur commune, communs à tous les scrutins. */
export function useContours() {
  return useQuery({
    queryKey: ['geo', 'bureaux_contours_2022'],
    queryFn: ({ signal }) => lireParquet<BureauContour>(`${RACINE_DONNEES}/geo/bureaux_contours_2022.parquet`, signal),
  })
}
