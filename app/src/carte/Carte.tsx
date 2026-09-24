import type { ExpressionSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import {
  Map as CarteMapLibre, NavigationControl, addProtocol, removeProtocol, setWorkerUrl,
  type FeatureIdentifier, type MapLayerMouseEvent,
} from 'maplibre-gl'
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { RACINE_DONNEES } from '../donnees/requetes'
import type { BureauContour } from '../donnees/types'
import type { Coloriage } from '../modes'
import type { Selection } from '../vue'
import { FOND_CARTE, TRAIT_HACHURES } from './couleurs'

// Contours des bureaux de vote : fichier officiel de data.gouv.fr (millésime 2022), lu directement.
const TUILES_BUREAUX = 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/reu/reu-france-entiere-2022-06-01-v2.pmtiles'
const COUCHE_BUREAUX = 'repertoire-unique-electoral-polygons'
// En dessous de ce zoom, la carte montre les communes plutôt que 70 000 bureaux (docs/PLAN.md, § 7.5).
const ZOOM_BUREAUX = 9
const ENCRE = '#1B1A17'

// MapLibre 6 cherche son worker à côté de son propre module, ce que le pré-bundling de Vite casse :
// Vite compile donc le worker (avec ses dépendances) et on lui en donne l'adresse.
setWorkerUrl(urlWorker)

// Couleur et opacité viennent du feature-state ; sans état, le territoire n'est pas peint.
const REMPLISSAGE = {
  'fill-color': ['to-color', ['coalesce', ['feature-state', 'couleur'], FOND_CARTE]] as ExpressionSpecification,
  'fill-opacity': ['coalesce', ['feature-state', 'opacite'], 0] as ExpressionSpecification,
}
const HACHURES = {
  'fill-pattern': 'hachures',
  'fill-opacity': ['case', ['boolean', ['feature-state', 'hachure'], false], 1, 0] as ExpressionSpecification,
}
const siSelection = (largeur: number) => ({
  'line-color': ENCRE,
  'line-width': largeur,
  'line-opacity': ['case', ['boolean', ['feature-state', 'selection'], false], 1, 0] as ExpressionSpecification,
})

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
    departements: { type: 'geojson', data: `${RACINE_DONNEES}/geo/departements.geojson`, promoteId: 'code' },
  },
  layers: [
    { id: 'fond', type: 'background', paint: { 'background-color': FOND_CARTE } },
    { id: 'communes', type: 'fill', source: 'communes', maxzoom: ZOOM_BUREAUX, paint: REMPLISSAGE },
    { id: 'communes-hachures', type: 'fill', source: 'communes', maxzoom: ZOOM_BUREAUX, paint: HACHURES },
    { id: 'bureaux', type: 'fill', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: REMPLISSAGE },
    { id: 'bureaux-hachures', type: 'fill', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: HACHURES },
    {
      id: 'bureaux-contours', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: 10,
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.2, 14, 1] },
    },
    {
      id: 'departements', type: 'line', source: 'departements',
      paint: { 'line-color': '#3a3a36', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 10, 1.4] },
    },
    { id: 'departements-selection', type: 'line', source: 'departements', paint: siSelection(2.5) },
    { id: 'communes-selection', type: 'line', source: 'communes', paint: siSelection(2.5) },
    { id: 'bureaux-selection', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: siSelection(3) },
  ],
}

/** Territoire sous le pointeur, avec sa position à l'écran pour l'infobulle. */
export interface Survol {
  niveau: 'bureau' | 'commune'
  code: string
  x: number
  y: number
  /** Largeur de la carte, pour garder l'infobulle dans le cadre. */
  largeur: number
}

/** Emprise à cadrer ([ouest, sud, est, nord]) ; le jeton change à chaque demande. */
export interface Cadrage {
  emprise: [number, number, number, number]
  jeton: number
}

interface Props {
  coloriage: Coloriage | null
  contours: BureauContour[]
  /** Carte au bureau de vote ; sinon chaque bureau prend la couleur de sa commune. */
  auBureau: boolean
  selection: Selection | undefined
  cadrage: Cadrage | null
  libelle: string
  onSurvol: (survol: Survol | null) => void
  onClic: (survol: Survol) => void
}

// Marges de cadrage : la légende occupe le bas à gauche sur ordinateur, le volet le bas de l'écran sur mobile.
function marges() {
  return window.innerWidth <= 760
    ? { top: 72, bottom: Math.round(window.innerHeight * 0.45), left: 16, right: 16 }
    : { top: 84, bottom: 24, left: 320, right: 72 }
}

const FRANCE_METROPOLITAINE: [[number, number], [number, number]] = [[-5.2, 41.3], [9.6, 51.1]]

function cible(selection: Selection): FeatureIdentifier {
  if (selection.niveau === 'bureau') return { source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: selection.code }
  return { source: selection.niveau === 'commune' ? 'communes' : 'departements', id: selection.code }
}

// Hachures à 45°, dessinées une fois : une texture qui se lit sans la couleur.
function motifHachures(pas = 8, ratio = 2) {
  const n = pas * ratio
  const data = new Uint8Array(n * n * 4)
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(TRAIT_HACHURES.slice(i, i + 2), 16))
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if ((x + y) % n >= 1.2 * ratio) continue
      data.set([r, v, b, 255], 4 * (y * n + x))
    }
  }
  return { width: n, height: n, data }
}

export function Carte({ coloriage, contours, auBureau, selection, cadrage, libelle, onSurvol, onClic }: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  const refCarte = useRef<CarteMapLibre | null>(null)
  const refSelection = useRef<Selection | undefined>(undefined)
  const [prete, setPrete] = useState(false)

  useEffect(() => {
    if (!conteneur.current) return
    const protocole = new Protocol()
    addProtocol('pmtiles', protocole.tile)
    const carte = new CarteMapLibre({
      container: conteneur.current,
      style: STYLE,
      bounds: FRANCE_METROPOLITAINE,
      fitBoundsOptions: { padding: marges() },
      minZoom: 3,
      maxZoom: 16,
    })
    carte.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    carte.on('styleimagemissing', (e) => {
      if (e.id === 'hachures' && !carte.hasImage('hachures')) carte.addImage('hachures', motifHachures(), { pixelRatio: 2 })
    })
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

  // Résultats du mode courant → feature-state. Changer de mode ou de scrutin ne recharge aucune géométrie.
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete || !coloriage) return
    carte.removeFeatureState({ source: 'communes' })
    carte.removeFeatureState({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX })
    for (const [code, etat] of coloriage.communes) carte.setFeatureState({ source: 'communes', id: code }, { ...etat })
    const bureau = (code: string, etat: object) => carte.setFeatureState({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: code }, etat)
    if (coloriage.bureaux) {
      for (const [code, etat] of coloriage.bureaux) bureau(code, { ...etat })
    } else {
      for (const { code_bv, code_commune } of contours) {
        const etat = coloriage.communes.get(code_commune)
        if (etat) bureau(code_bv, { ...etat })
      }
    }
    carte.setLayoutProperty('bureaux-contours', 'visibility', auBureau ? 'visible' : 'none')
    // Retirer les états a aussi effacé la sélection : on la remet.
    if (refSelection.current) carte.setFeatureState(cible(refSelection.current), { selection: true })
  }, [prete, coloriage, contours, auBureau])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    if (refSelection.current) carte.removeFeatureState(cible(refSelection.current), 'selection')
    if (selection) carte.setFeatureState(cible(selection), { selection: true })
    refSelection.current = selection
  }, [prete, selection])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete || !cadrage) return
    const [ouest, sud, est, nord] = cadrage.emprise
    carte.fitBounds([[ouest, sud], [est, nord]], { padding: marges(), maxZoom: 13, duration: 600 })
  }, [prete, cadrage])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const territoire = (e: MapLayerMouseEvent): Survol | null => {
      const p = e.features?.[0]?.properties
      if (!p) return null
      const position = { x: e.point.x, y: e.point.y, largeur: carte.getContainer().clientWidth }
      if (e.features?.[0]?.layer.id === 'communes') return { niveau: 'commune', code: p.code, ...position }
      return auBureau ? { niveau: 'bureau', code: p.codeBureauVote, ...position } : { niveau: 'commune', code: p.codeCommune, ...position }
    }
    const survol = (e: MapLayerMouseEvent) => onSurvol(territoire(e))
    const clic = (e: MapLayerMouseEvent) => {
      const t = territoire(e)
      if (t) onClic(t)
    }
    const quitter = () => {
      carte.getCanvas().style.cursor = ''
      onSurvol(null)
    }
    const entrer = () => { carte.getCanvas().style.cursor = 'pointer' }
    for (const couche of ['bureaux', 'communes']) {
      carte.on('mousemove', couche, survol)
      carte.on('mouseenter', couche, entrer)
      carte.on('mouseleave', couche, quitter)
      carte.on('click', couche, clic)
    }
    return () => {
      for (const couche of ['bureaux', 'communes']) {
        carte.off('mousemove', couche, survol)
        carte.off('mouseenter', couche, entrer)
        carte.off('mouseleave', couche, quitter)
        carte.off('click', couche, clic)
      }
    }
  }, [prete, auBureau, onSurvol, onClic])

  return <div ref={conteneur} className="carte" role="region" aria-label={libelle} />
}
