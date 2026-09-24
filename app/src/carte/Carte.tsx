import type { ExpressionSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import {
  Map as CarteMapLibre, NavigationControl, addProtocol, removeProtocol, setWorkerUrl,
  type FeatureIdentifier, type GeoJSONSource, type MapLayerMouseEvent, type MapSourceDataEvent,
} from 'maplibre-gl'
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
// Styles des contrôles de la carte : chargés avec elle, pas avant (ils ne bloquent plus le premier affichage).
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Feature } from 'geojson'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { RACINE_DONNEES } from '../donnees/requetes'
import { arrondissementDu, estArrondissement } from '../donnees/territoires'
import type { BureauContour } from '../donnees/types'
import type { Coloriage } from '../modes'
import type { Etat } from './etats'
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
      attribution: 'Contours des bureaux : data.gouv.fr (2022, indicatifs)',
    },
    communes: {
      type: 'geojson',
      data: `${RACINE_DONNEES}/geo/communes.geojson`,
      promoteId: 'code',
      attribution: 'Contours administratifs : IGN, simplifiés par Etalab',
    },
    departements: { type: 'geojson', data: `${RACINE_DONNEES}/geo/departements.geojson`, promoteId: 'code' },
    contour: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    // Chargée seulement pour les législatives (setData), par fusion des contours des bureaux.
    circonscriptions: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'code' },
  },
  layers: [
    { id: 'fond', type: 'background', paint: { 'background-color': FOND_CARTE } },
    { id: 'communes', type: 'fill', source: 'communes', maxzoom: ZOOM_BUREAUX, paint: REMPLISSAGE },
    { id: 'communes-hachures', type: 'fill', source: 'communes', maxzoom: ZOOM_BUREAUX, paint: HACHURES },
    { id: 'circonscriptions', type: 'fill', source: 'circonscriptions', maxzoom: ZOOM_BUREAUX, paint: REMPLISSAGE, layout: { visibility: 'none' } },
    { id: 'circonscriptions-hachures', type: 'fill', source: 'circonscriptions', maxzoom: ZOOM_BUREAUX, paint: HACHURES, layout: { visibility: 'none' } },
    { id: 'bureaux', type: 'fill', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: REMPLISSAGE },
    { id: 'bureaux-hachures', type: 'fill', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: HACHURES },
    {
      id: 'bureaux-contours', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: 10,
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.2, 14, 1] },
    },
    {
      id: 'circonscriptions-contours', type: 'line', source: 'circonscriptions',
      paint: { 'line-color': '#3a3a36', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.3, 12, 1.4] },
    },
    {
      id: 'departements', type: 'line', source: 'departements',
      paint: { 'line-color': '#3a3a36', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 10, 1.4] },
    },
    { id: 'departements-selection', type: 'line', source: 'departements', paint: siSelection(2.5) },
    { id: 'communes-selection', type: 'line', source: 'communes', paint: siSelection(2.5) },
    { id: 'circonscriptions-selection', type: 'line', source: 'circonscriptions', paint: siSelection(2.5) },
    { id: 'bureaux-selection', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: siSelection(3) },
    { id: 'contour-selection', type: 'line', source: 'contour', paint: { 'line-color': ENCRE, 'line-width': 2.5 } },
  ],
}

/** Territoire sous le pointeur, avec sa position à l'écran pour l'infobulle. */
export interface Survol {
  niveau: 'bureau' | 'commune' | 'arrondissement' | 'circonscription'
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
  /** Scrutin législatif : charge et montre la couche des circonscriptions. */
  circonscriptions: boolean
  selection: Selection | undefined
  /** Contour détaillé de la commune sélectionnée, quand il est arrivé : il remplace le contour simplifié. */
  contour: Feature | undefined
  cadrage: Cadrage | null
  libelle: string
  onSurvol: (survol: Survol | null) => void
  onClic: (survol: Survol) => void
  /** Style chargé : les téléchargements qui attendaient la carte peuvent partir. */
  onPrete: () => void
}

// Marges de cadrage : la légende occupe le bas à gauche sur ordinateur, le volet le bas de l'écran sur mobile.
function marges() {
  return window.innerWidth <= 760
    ? { top: 72, bottom: Math.round(window.innerHeight * 0.45), left: 16, right: 16 }
    : { top: 84, bottom: 24, left: 320, right: 72 }
}

const FRANCE_METROPOLITAINE: [[number, number], [number, number]] = [[-5.2, 41.3], [9.6, 51.1]]

// Territoire à surligner (les circonscriptions ont leur couche, chargée pour les législatives).
function cible(selection: Selection): FeatureIdentifier | null {
  if (selection.niveau === 'bureau') return { source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: selection.code }
  const source = {
    commune: 'communes', arrondissement: 'communes', circonscription: 'circonscriptions', departement: 'departements',
  }[selection.niveau]
  return { source, id: selection.code }
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

export function Carte({ coloriage, contours, auBureau, circonscriptions, selection, contour, cadrage, libelle, onSurvol, onClic, onPrete }: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  const refCarte = useRef<CarteMapLibre | null>(null)
  const refSelection = useRef<Selection | undefined>(undefined)
  const refPoses = useRef(new Map<string, ReadonlyMap<string, Etat>>())

  /**
   * États d'une source, posés en ne touchant qu'aux territoires qui changent : MapLibre met près d'une
   * seconde (plusieurs sur un téléphone) à poser 35 000 états, souvent identiques d'un coloriage à l'autre
   * (les bureaux qui arrivent après les communes, par exemple).
   */
  function poser(carte: CarteMapLibre, source: 'communes' | 'circonscriptions', etats: ReadonlyMap<string, Etat>) {
    const avant = refPoses.current.get(source) ?? new Map<string, Etat>()
    for (const code of avant.keys()) if (!etats.has(code)) carte.removeFeatureState({ source, id: code })
    for (const [code, etat] of etats) {
      const a = avant.get(code)
      if (!a || a.couleur !== etat.couleur || a.opacite !== etat.opacite || a.hachure !== etat.hachure) {
        carte.setFeatureState({ source, id: code }, { ...etat })
      }
    }
    refPoses.current.set(source, etats)
  }
  const [prete, setPrete] = useState(false)
  // Contours des communes chargés : ce qui attendait la carte peut se télécharger sans leur disputer le réseau.
  const [communesChargees, setCommunesChargees] = useState(false)
  useEffect(() => {
    if (communesChargees) onPrete()
  }, [communesChargees, onPrete])

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
    // Motif des hachures, dessiné à la première demande (depuis MapLibre 6.11, l'événement
    // « styleimagemissing » arrive trop tard pour servir cette demande-là).
    carte.setMissingStyleImageResolver((id) => {
      if (id === 'hachures' && !carte.hasImage('hachures')) carte.addImage('hachures', motifHachures(), { pixelRatio: 2 })
    })
    // Les résultats peuvent être appliqués dès que les sources existent : inutile d'attendre le
    // premier rendu complet ('load'), qui tarde quand l'onglet est en arrière-plan.
    carte.once('style.load', () => {
      setPrete(true)
      // Secours : des contours qui tardent (réseau très lent, erreur) ne bloquent pas le reste indéfiniment.
      setTimeout(() => setCommunesChargees(true), 8000)
    })
    const surDonnees = (e: MapSourceDataEvent) => {
      if (e.sourceId !== 'communes' || !e.isSourceLoaded) return
      carte.off('sourcedata', surDonnees)
      setCommunesChargees(true)
    }
    carte.on('sourcedata', surDonnees)
    carte.on('error', (e) => console.error('Carte :', e.error))
    // Limites départementales : tracé à 1 000 m pour la vue nationale, remplacé une fois pour toutes par
    // celui à 100 m (huit fois plus lourd) à l'approche du zoom des bureaux.
    const detaillerDepartements = () => {
      const source = carte.getSource<GeoJSONSource>('departements')
      if (!source || carte.getZoom() < ZOOM_BUREAUX - 1) return
      carte.off('zoomend', detaillerDepartements)
      source.setData(`${RACINE_DONNEES}/geo/departements-detail.geojson`)
    }
    carte.on('zoomend', detaillerDepartements)
    refCarte.current = carte
    if (import.meta.env.DEV) Object.assign(window, { carteAtlas: carte }) // inspection en développement
    return () => {
      carte.remove()
      removeProtocol('pmtiles')
      refCarte.current = null
      setPrete(false)
    }
  }, [])

  // Circonscriptions : la couche (6 Mo) n'est chargée qu'aux législatives.
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    carte.getSource<GeoJSONSource>('circonscriptions')?.setData(
      circonscriptions ? `${RACINE_DONNEES}/geo/circonscriptions.geojson` : { type: 'FeatureCollection', features: [] },
    )
    carte.setLayoutProperty('circonscriptions-contours', 'visibility', circonscriptions ? 'visible' : 'none')
  }, [prete, circonscriptions])

  // Résultats du mode courant → feature-state. Changer de mode ou de scrutin ne recharge aucune géométrie.
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete || !coloriage) return
    // Paris, Lyon et Marseille : leurs arrondissements, dessinés par-dessus la ville, ont leurs propres résultats.
    poser(carte, 'communes', new Map([...coloriage.communes, ...(coloriage.arrondissements ?? [])]))
    // Aux législatives, la vue nationale montre les circonscriptions à la place des communes.
    const parCirconscription = (coloriage.circonscriptions?.size ?? 0) > 0
    poser(carte, 'circonscriptions', coloriage.circonscriptions ?? new Map())
    carte.removeFeatureState({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX })
    for (const couche of ['circonscriptions', 'circonscriptions-hachures']) carte.setLayoutProperty(couche, 'visibility', parCirconscription ? 'visible' : 'none')
    for (const couche of ['communes', 'communes-hachures']) carte.setLayoutProperty(couche, 'visibility', parCirconscription ? 'none' : 'visible')
    carte.setLayoutProperty('bureaux-contours', 'visibility', auBureau ? 'visible' : 'none')
    // Retirer des états a pu effacer la sélection : on la remet.
    const surlignee = refSelection.current && cible(refSelection.current)
    if (surlignee) carte.setFeatureState(surlignee, { selection: true })

    // Les 70 000 bureaux ne se voient qu'à partir du zoom des bureaux : leurs états (plusieurs secondes sur
    // un téléphone) ne sont posés qu'à l'approche de ce zoom, une fois par coloriage.
    let bureauxPoses = false
    const poserBureaux = () => {
      if (bureauxPoses || carte.getZoom() < ZOOM_BUREAUX - 1) return
      bureauxPoses = true
      const bureau = (code: string, etat: object) => carte.setFeatureState({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: code }, etat)
      if (coloriage.bureaux) {
        for (const [code, etat] of coloriage.bureaux) bureau(code, { ...etat })
      } else {
        for (const { code_bv, code_commune } of contours) {
          const arrondissement = arrondissementDu(code_bv)
          const etat = (arrondissement && coloriage.arrondissements?.get(arrondissement)) || coloriage.communes.get(code_commune)
          if (etat) bureau(code_bv, { ...etat })
        }
      }
      if (refSelection.current?.niveau === 'bureau') bureau(refSelection.current.code, { selection: true })
    }
    poserBureaux()
    carte.on('zoomend', poserBureaux)
    return () => { carte.off('zoomend', poserBureaux) }
  }, [prete, coloriage, contours, auBureau])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const precedente = refSelection.current && cible(refSelection.current)
    if (precedente) carte.removeFeatureState(precedente, 'selection')
    // Le contour détaillé, s'il est là, remplace le contour simplifié de la commune.
    const detaille = selection?.niveau === 'commune' && contour !== undefined
    const nouvelle = selection && !detaille ? cible(selection) : null
    if (nouvelle) carte.setFeatureState(nouvelle, { selection: true })
    refSelection.current = detaille ? undefined : selection
    const source = carte.getSource<GeoJSONSource>('contour')
    source?.setData(detaille ? contour : { type: 'FeatureCollection', features: [] })
  }, [prete, selection, contour])

  const refCadre = useRef('')
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete || !cadrage) return
    // Un cadrage recalculé à l'identique (l'index des territoires se complète) ne ramène pas en arrière
    // une carte que l'on a déjà déplacée.
    const cle = `${cadrage.jeton}:${cadrage.emprise.join(',')}`
    if (cle === refCadre.current) return
    refCadre.current = cle
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
      const couche = e.features?.[0]?.layer.id
      if (couche === 'communes') return { niveau: estArrondissement(p.code) ? 'arrondissement' : 'commune', code: p.code, ...position }
      if (couche === 'circonscriptions') return { niveau: 'circonscription', code: p.code, ...position }
      if (auBureau) return { niveau: 'bureau', code: p.codeBureauVote, ...position }
      // Carte à la commune : un bureau de Paris, Lyon ou Marseille désigne son arrondissement.
      const arrondissement = arrondissementDu(p.codeBureauVote)
      return arrondissement
        ? { niveau: 'arrondissement', code: arrondissement, ...position }
        : { niveau: 'commune', code: p.codeCommune, ...position }
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
    for (const couche of ['bureaux', 'communes', 'circonscriptions']) {
      carte.on('mousemove', couche, survol)
      carte.on('mouseenter', couche, entrer)
      carte.on('mouseleave', couche, quitter)
      carte.on('click', couche, clic)
    }
    return () => {
      for (const couche of ['bureaux', 'communes', 'circonscriptions']) {
        carte.off('mousemove', couche, survol)
        carte.off('mouseenter', couche, entrer)
        carte.off('mouseleave', couche, quitter)
        carte.off('click', couche, clic)
      }
    }
  }, [prete, auBureau, onSurvol, onClic])

  return <div ref={conteneur} className="carte" role="region" aria-label={libelle} />
}
