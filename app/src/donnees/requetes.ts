import { useQuery } from '@tanstack/react-query'
import type { Feature } from 'geojson'
import { lireCsv } from './csv'
import { lireParquet } from './parquet'
import type {
  Agregat, Bureau, BureauContour, Candidature, Catalogue, Circonscription, CodePostal, Encart, LigneSerie, Manifeste, Passage, Territoire,
  VoixAgregat, VoixBureau, VoixPanachage,
} from './types'

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

// Un fichier n'est demandé que si le scrutin est connu : passer undefined suspend la requête.
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
export const useVoix = (scrutin?: string) => useFichier<VoixBureau>(scrutin, 'voix.parquet')
export const useAgregatsVoix = (scrutin?: string) => useFichier<VoixAgregat>(scrutin, 'agregats_voix.parquet')
/** Municipales jusqu'en 2020 : candidats des communes au panachage d'un département, à la demande. */
export function usePanachage(scrutin: string | undefined, departement: string | undefined) {
  return useQuery({
    queryKey: ['scrutin', scrutin, 'panachage', departement],
    enabled: scrutin !== undefined && departement !== undefined,
    queryFn: ({ signal }) => lireParquet<VoixPanachage>(`${RACINE_DONNEES}/${scrutin}/panachage/${departement}.parquet`, signal),
  })
}

/** Manifeste d'un scrutin (contrôles, empreintes), pour le rapport qualité de la page Méthodologie. */
export function useManifeste(scrutin: string | undefined) {
  return useQuery({
    queryKey: ['scrutin', scrutin, 'manifeste'],
    enabled: scrutin !== undefined,
    queryFn: async ({ signal }) => {
      const reponse = await fetch(`${RACINE_DONNEES}/${scrutin}/scrutin.json`, { signal })
      if (!reponse.ok) throw new Error(`manifeste indisponible (HTTP ${reponse.status})`)
      return (await reponse.json()) as Manifeste
    },
  })
}

/** Référentiel publié en CSV (grille des nuances, totaux officiels), lu à la demande. */
export function useReferentiel(fichier: 'nuances.csv' | 'totaux_officiels.csv' | 'totaux_officiels_variantes.csv', actif: boolean) {
  return useQuery({
    queryKey: ['referentiel', fichier],
    enabled: actif,
    queryFn: async ({ signal }) => {
      const reponse = await fetch(`${RACINE_DONNEES}/referentiels/${fichier}`, { signal })
      if (!reponse.ok) throw new Error(`référentiel indisponible (HTTP ${reponse.status})`)
      return lireCsv(await reponse.text())
    },
  })
}

/** Séries de la France, des départements et des circonscriptions : un seul petit fichier. */
export function useSeriesTerritoires(actif: boolean) {
  return useQuery({
    queryKey: ['series', 'territoires'],
    enabled: actif,
    queryFn: ({ signal }) => lireParquet<LigneSerie>(`${RACINE_DONNEES}/series/territoires.parquet`, signal),
  })
}

/** Séries des communes d'un département, chargées à l'ouverture de la fiche d'une commune. */
export function useSeriesCommunes(departement: string | undefined) {
  return useQuery({
    queryKey: ['series', 'communes', departement],
    enabled: departement !== undefined,
    queryFn: ({ signal }) => lireParquet<LigneSerie>(`${RACINE_DONNEES}/series/communes/${departement}.parquet`, signal),
  })
}

/** Législatives seulement : libellés et emprises des circonscriptions. */
export const useCirconscriptions = (scrutin?: string) => useFichier<Circonscription>(scrutin, 'circonscriptions.parquet')

function useGeo<T>(fichier: string, actif = true) {
  return useQuery({
    queryKey: ['geo', fichier],
    enabled: actif,
    queryFn: ({ signal }) => lireParquet<T>(`${RACINE_DONNEES}/geo/${fichier}`, signal),
  })
}

/** Encarts de la vue nationale : Paris et petite couronne, départements d'outre-mer. */
export function useEncarts(actif: boolean) {
  return useQuery({
    queryKey: ['geo', 'encarts.json'],
    enabled: actif,
    queryFn: async ({ signal }) => {
      const reponse = await fetch(`${RACINE_DONNEES}/geo/encarts.json`, { signal })
      if (!reponse.ok) throw new Error(`encarts indisponibles (HTTP ${reponse.status})`)
      return ((await reponse.json()) as { encarts: Encart[] }).encarts
    },
  })
}

/** Bureaux des contours officiels et leur commune, communs à tous les scrutins. */
export const useContours = (actif: boolean) => useGeo<BureauContour>('bureaux_contours_2022.parquet', actif)

/** Noms et emprises des départements et des communes (découpage 2026) : 600 Ko. */
export const useTerritoires = (actif: boolean) => useGeo<Territoire>('territoires.parquet', actif)

/** Les départements seuls (quelques Ko) : la vue nationale n'attend pas l'index complet. */
export const useDepartements = () => useGeo<Territoire>('territoires_departements.parquet')

/** Codes postaux des communes, pour la recherche : demandés à la première utilisation du champ. */
export function useCodesPostaux(actif: boolean) {
  return useQuery({
    queryKey: ['geo', 'codes_postaux.parquet'],
    enabled: actif,
    queryFn: ({ signal }) => lireParquet<CodePostal>(`${RACINE_DONNEES}/geo/codes_postaux.parquet`, signal),
  })
}

/** Communes fusionnées depuis 2022 : ancien code → commune du COG 2026. */
export const usePassage = () => useGeo<Passage>('passage_communes.parquet')

/**
 * Contour détaillé d'une commune, demandé à l'API Découpage administratif (geo.api.gouv.fr) au moment
 * où elle est sélectionnée : la couche nationale, simplifiée à 1 km, paraît grossière à fort zoom.
 * En cas d'échec, la carte garde le contour simplifié.
 */
export function useContourCommune(code: string | undefined) {
  return useQuery({
    queryKey: ['contour', code],
    enabled: code !== undefined,
    retry: 0,
    queryFn: async ({ signal }) => {
      const reponse = await fetch(`https://geo.api.gouv.fr/communes/${code}?format=geojson&geometry=contour&fields=code`, { signal })
      if (!reponse.ok) throw new Error(`contour indisponible (HTTP ${reponse.status})`)
      return (await reponse.json()) as Feature
    },
  })
}
