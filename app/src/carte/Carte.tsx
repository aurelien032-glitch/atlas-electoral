import type { ExpressionSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import {
  Map as CarteMapLibre, NavigationControl, addProtocol, removeProtocol, setWorkerUrl, type MapLayerMouseEvent,
} from 'maplibre-gl'
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { RACINE_DONNEES } from '../donnees/requetes'
import type { Agregat, Bloc, Bureau, BureauContour, NiveauCarte } from '../donnees/types'
import { GRIS } from './couleurs'
import { COULEURS_PAR_INDEX, etatTerritoire, type Etat } from './etats'

// Contours des bureaux de vote : fichier officiel de data.gouv.fr (millésime 2022), lu directement.
const TUILES_BUREAUX = 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/reu/reu-france-entiere-2022-06-01-v2.pmtiles'
const COUCHE_BUREAUX = 'repertoire-unique-electoral-polygons'
// En dessous de ce zoom, la carte montre les communes plutôt que 70 000 bureaux (docs/PLAN.md, § 7.5).
const ZOOM_BUREAUX = 9

// MapLibre 6 cherche son worker à côté de son propre module, ce que le pré-bundling de Vite casse :
// Vite compile donc le worker (avec ses dépendances) et on lui en donne l'adresse.
setWorkerUrl(urlWorker)

const REMPLISSAGE = {
  'fill-color': ['match', ['coalesce', ['feature-state', 'categorie'], -1], ...COULEURS_PAR_INDEX, GRIS.sansResultat] as unknown as ExpressionSpecification,
  'fill-opacity': ['coalesce', ['feature-state', 'opacite'], 1] as ExpressionSpecification,
}

// Contours administratifs : versions simplifiées d'Etalab (COG 2026), copiées par le pipeline. Les
// tuiles ADMIN EXPRESS de l'IGN sont trop lourdes en vue nationale (11,4 Mo par tuile au zoom 5).
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    bureaux: {
      type: 'vector',
      url: `pmtiles://${TUILES_BUREAUX}`,
      promoteId: 'codeBureauVote',
      attribution: 'Contours des bureaux : data.gouv.fr (REU 2022)',
    },
    communes: {
      type: 'geojson',
      data: `${RACINE_DONNEES}/geo/communes.geojson`,
      promoteId: 'code',
      attribution: 'Contours administratifs : IGN, simplifiés par Etalab',
    },
    departements: { type: 'geojson', data: `${RACINE_DONNEES}/geo/departements.geojson` },
  },
  layers: [
    { id: 'fond', type: 'background', paint: { 'background-color': '#f6f6f3' } },
    { id: 'communes', type: 'fill', source: 'communes', maxzoom: ZOOM_BUREAUX, paint: REMPLISSAGE },
    { id: 'bureaux', type: 'fill', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: REMPLISSAGE },
    {
      id: 'bureaux-contours', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: 10,
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.2, 14, 1] },
    },
    {
      id: 'departements', type: 'line', source: 'departements',
      paint: { 'line-color': '#3a3a36', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 10, 1.4] },
    },
  ],
}

export interface Survol {
  niveau: 'bureau' | 'commune'
  code: string
  nom: string
  numero?: string
}

interface Props {
  bureaux: Bureau[]
  communes: Agregat[]
  contours: BureauContour[]
  blocDe: (cand: number) => Bloc
  niveau: NiveauCarte
  onSurvol: (survol: Survol) => void
}

export function Carte({ bureaux, communes, contours, blocDe, niveau, onSurvol }: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  const refCarte = useRef<CarteMapLibre | null>(null)
  const [prete, setPrete] = useState(false)

  useEffect(() => {
    if (!conteneur.current) return
    const protocole = new Protocol()
    addProtocol('pmtiles', protocole.tile)
    const carte = new CarteMapLibre({
      container: conteneur.current,
      style: STYLE,
      center: [2.4, 46.6],
      zoom: 5,
      minZoom: 4,
      maxZoom: 16,
    })
    carte.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    // Les résultats peuvent être appliqués dès que les sources existent : inutile d'attendre le
    // premier rendu complet ('load'), qui tarde quand l'onglet est en arrière-plan.
    carte.once('style.load', () => setPrete(true))
    carte.on('error', (e) => console.error('Carte :', e.error))
    refCarte.current = carte
    if (import.meta.env.DEV) Object.assign(window, { carteAtlas: carte }) // inspection en développement
    return () => {
      carte.remove()
      removeProtocol('pmtiles')
      refCarte.current = null
      setPrete(false)
    }
  }, [])

  // Résultats du scrutin → feature-state. Changer de scrutin ne recharge aucune géométrie.
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    carte.removeFeatureState({ source: 'communes' })
    carte.removeFeatureState({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX })
    const etatsCommunes = new Map<string, Etat>()
    for (const commune of communes) {
      const etat = etatTerritoire(commune, blocDe)
      if (!etat) continue
      etatsCommunes.set(commune.code, etat)
      carte.setFeatureState({ source: 'communes', id: commune.code }, etat)
    }
    const bureau = (code: string, etat: Etat) =>
      carte.setFeatureState({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: code }, etat)
    if (niveau === 'bureau') {
      for (const b of bureaux) {
        const etat = etatTerritoire(b, blocDe)
        if (etat) bureau(b.code_bv, etat)
      }
    } else {
      // Contours trop anciens pour ce scrutin : chaque bureau prend la couleur de sa commune.
      for (const { code_bv, code_commune } of contours) {
        const etat = etatsCommunes.get(code_commune)
        if (etat) bureau(code_bv, etat)
      }
    }
    carte.setLayoutProperty('bureaux-contours', 'visibility', niveau === 'bureau' ? 'visible' : 'none')
  }, [prete, bureaux, communes, contours, blocDe, niveau])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const surBureau = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties
      if (!p) return
      if (niveau === 'bureau') onSurvol({ niveau: 'bureau', code: p.codeBureauVote, nom: p.nomCommune, numero: p.numeroBureauVote })
      else onSurvol({ niveau: 'commune', code: p.codeCommune, nom: p.nomCommune })
    }
    const surCommune = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties
      if (p) onSurvol({ niveau: 'commune', code: p.code, nom: p.nom ?? p.code })
    }
    for (const evenement of ['mousemove', 'click'] as const) {
      carte.on(evenement, 'bureaux', surBureau)
      carte.on(evenement, 'communes', surCommune)
    }
    return () => {
      for (const evenement of ['mousemove', 'click'] as const) {
        carte.off(evenement, 'bureaux', surBureau)
        carte.off(evenement, 'communes', surCommune)
      }
    }
  }, [prete, niveau, onSurvol])

  return <div ref={conteneur} className="carte" role="region" aria-label="Carte du bloc en tête" />
}
