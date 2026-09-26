import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import {
  Map as CarteMapLibre, NavigationControl, addProtocol, removeProtocol, setWorkerUrl,
  type FeatureIdentifier, type GeoJSONSource, type MapLayerMouseEvent, type MapSourceDataEvent,
} from 'maplibre-gl'
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
// Styles des contrôles de la carte : chargés avec elle, pas avant (ils ne bloquent plus le premier affichage).
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Feature, FeatureCollection } from 'geojson'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { RACINE_DONNEES } from '../donnees/requetes'
import { arrondissementDu, estArrondissement, villeDe } from '../donnees/territoires'
import type { BureauContour } from '../donnees/types'
import type { Coloriage } from '../modes'
import type { Etat } from './etats'
import { ecrireCadre, lireCadre, type Selection } from '../vue'
import { FOND_CARTE, OPACITE_SUR_PLAN, TRAIT_HACHURES } from './couleurs'
import { enVolet, estFrance, FRANCE_METROPOLITAINE, marges, memesMarges, type Ecran, type Place } from './place'
import type { Repli } from './repli'

// Contours des bureaux de vote : fichier officiel de data.gouv.fr (millésime 2022), lu directement.
const TUILES_BUREAUX = 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/reu/reu-france-entiere-2022-06-01-v2.pmtiles'
const COUCHE_BUREAUX = 'repertoire-unique-electoral-polygons'
// En dessous de ce zoom, la carte montre les communes plutôt que 70 000 bureaux (docs/PLAN.md, § 7.5).
const ZOOM_BUREAUX = 9
const ENCRE = '#1B1A17'

// Fond de plan au zoom des bureaux (rues, bâtiments, noms de lieux) : le Plan IGN de la Géoplateforme, service
// public sans clé, rendu en gris clair par MapLibre pour ne pas se mêler aux couleurs des blocs. Les bureaux y
// sont semi-transparents (OPACITE_SUR_PLAN, réglable par le curseur de la carte). Positron (CARTO) exige
// désormais une clé.
const PLAN_IGN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
  + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png'
  + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
// Adresse choisie dans la recherche : la carte s'approche jusqu'à la rue.
const ZOOM_ADRESSE = 15
const VIDE: FeatureCollection = { type: 'FeatureCollection', features: [] }

// MapLibre 6 cherche son worker à côté de son propre module, ce que le pré-bundling de Vite casse :
// Vite compile donc le worker (avec ses dépendances) et on lui en donne l'adresse.
setWorkerUrl(urlWorker)

// Couleur et opacité viennent du feature-state ; sans état, le territoire n'est pas peint.
const REMPLISSAGE = {
  'fill-color': ['to-color', ['coalesce', ['feature-state', 'couleur'], FOND_CARTE]] as ExpressionSpecification,
  'fill-opacity': ['coalesce', ['feature-state', 'opacite'], 0] as ExpressionSpecification,
}
// Au zoom des bureaux, le plan se lit à travers les couleurs.
const opaciteSurPlan = (opacite: number): ExpressionSpecification => ['*', opacite, ['coalesce', ['feature-state', 'opacite'], 0]]
const REMPLISSAGE_SUR_PLAN = { ...REMPLISSAGE, 'fill-opacity': opaciteSurPlan(OPACITE_SUR_PLAN) }
const HACHURES = {
  'fill-pattern': 'hachures',
  'fill-opacity': ['case', ['boolean', ['feature-state', 'hachure'], false], 1, 0] as ExpressionSpecification,
}
// Communes à dessiner au zoom des bureaux, faute de contour de bureau (quelques dizaines au plus).
const communesParmi = (codes: Iterable<string>): FilterSpecification => ['in', ['get', 'code'], ['literal', [...codes]]]
const siSelection = (largeur: number) => ({
  'line-color': ENCRE,
  'line-width': largeur,
  'line-opacity': ['case', ['boolean', ['feature-state', 'selection'], false], 1, 0] as ExpressionSpecification,
})

// Contours administratifs : versions simplifiées d'Etalab (COG 2026), copiées par le pipeline. Les
// tuiles ADMIN EXPRESS de l'IGN sont trop lourdes en vue nationale (11,4 Mo par tuile au zoom 5).
// Mentions des sources brèves, pour tenir sur une ligne d'un téléphone ; le détail est dans le panneau.
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    bureaux: {
      type: 'vector',
      url: `pmtiles://${TUILES_BUREAUX}`,
      promoteId: 'codeBureauVote',
      attribution: 'Bureaux : data.gouv.fr (2022)',
    },
    communes: {
      type: 'geojson',
      data: `${RACINE_DONNEES}/geo/communes.geojson`,
      // Marge de tuile réduite (128 par défaut) : moins de tracés dupliqués au bord des tuiles, que chaque coloriage
      // recalcule (0,3 s de moins sur un téléphone). Les communes sont des surfaces sans contour : rien ne se voit.
      buffer: 32,
      promoteId: 'code',
      attribution: 'Limites : IGN, Etalab',
    },
    departements: { type: 'geojson', data: `${RACINE_DONNEES}/geo/departements.geojson`, promoteId: 'code' },
    contour: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    // Chargée seulement pour les législatives (setData), par fusion des contours des bureaux.
    circonscriptions: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'code' },
    repere: { type: 'geojson', data: VIDE },
    // Tuiles demandées à partir du zoom des bureaux seulement : sans ce plancher, MapLibre précharge les niveaux
    // parents (zooms 2 à 8), qu'on n'affiche pas.
    plan: { type: 'raster', tiles: [PLAN_IGN], tileSize: 256, minzoom: ZOOM_BUREAUX, maxzoom: 19, attribution: 'Plan IGN' },
  },
  layers: [
    { id: 'fond', type: 'background', paint: { 'background-color': FOND_CARTE } },
    {
      id: 'plan', type: 'raster', source: 'plan', minzoom: ZOOM_BUREAUX,
      paint: { 'raster-saturation': -1, 'raster-brightness-min': 0.3, 'raster-contrast': -0.1, 'raster-fade-duration': 0 },
    },
    // Au zoom des bureaux, une commune qui n'a aucun contour de bureau (Troyes, Belfort…) reste dessinée, à sa couleur.
    { id: 'communes-repli', type: 'fill', source: 'communes', minzoom: ZOOM_BUREAUX, filter: communesParmi([]), paint: REMPLISSAGE_SUR_PLAN },
    { id: 'communes-repli-hachures', type: 'fill', source: 'communes', minzoom: ZOOM_BUREAUX, filter: communesParmi([]), paint: HACHURES, layout: { visibility: 'none' } },
    { id: 'communes', type: 'fill', source: 'communes', maxzoom: ZOOM_BUREAUX, paint: REMPLISSAGE },
    { id: 'communes-hachures', type: 'fill', source: 'communes', maxzoom: ZOOM_BUREAUX, paint: HACHURES, layout: { visibility: 'none' } },
    { id: 'circonscriptions', type: 'fill', source: 'circonscriptions', maxzoom: ZOOM_BUREAUX, paint: REMPLISSAGE, layout: { visibility: 'none' } },
    { id: 'circonscriptions-hachures', type: 'fill', source: 'circonscriptions', maxzoom: ZOOM_BUREAUX, paint: HACHURES, layout: { visibility: 'none' } },
    { id: 'bureaux', type: 'fill', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: REMPLISSAGE_SUR_PLAN },
    { id: 'bureaux-hachures', type: 'fill', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: HACHURES, layout: { visibility: 'none' } },
    {
      id: 'bureaux-contours', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: 10,
      paint: {
        'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.2, 14, 1],
        'line-opacity': ['case', ['boolean', ['feature-state', 'commune'], false], 0, 1],
      },
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
    // Contour simplifié d'une commune ou d'un arrondissement, en secours du contour détaillé : par un filtre, pas par
    // l'état des communes, que chaque coloriage recalcule pour toute couche qui le lit (0,5 s sur un téléphone).
    { id: 'communes-selection', type: 'line', source: 'communes', filter: communesParmi([]), paint: { 'line-color': ENCRE, 'line-width': 2.5 } },
    { id: 'circonscriptions-selection', type: 'line', source: 'circonscriptions', paint: siSelection(2.5) },
    { id: 'bureaux-selection', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: siSelection(3) },
    { id: 'contour-selection', type: 'line', source: 'contour', paint: { 'line-color': ENCRE, 'line-width': 2.5 } },
    // Repère de l'adresse choisie : un point d'encre cerclé de blanc, lisible sur toutes les couleurs.
    {
      id: 'repere', type: 'circle', source: 'repere',
      paint: { 'circle-radius': 7, 'circle-color': ENCRE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
    },
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

/** Adresse choisie dans la recherche : la carte s'y rend et y lit le bureau de vote. */
export interface VisiteAdresse {
  lon: number
  lat: number
  jeton: number
}

interface Props {
  coloriage: Coloriage | null
  contours: BureauContour[]
  /** Carte au bureau de vote ; sinon chaque bureau prend la couleur de sa commune. */
  auBureau: boolean
  /** Ce qui se montre à la commune faute de contour de bureau (null tant que les contours n'ont pas été lus). */
  repli: Repli | null
  /** Scrutin législatif : charge et montre la couche des circonscriptions. */
  circonscriptions: boolean
  selection: Selection | undefined
  /** Contour détaillé de la commune ou de l'arrondissement sélectionné, quand il est arrivé. */
  contour: Feature | undefined
  /** Contour détaillé indisponible (geo.api.gouv.fr en échec) : le contour simplifié le remplace. */
  contourIndisponible: boolean
  cadrage: Cadrage | null
  libelle: string
  onSurvol: (survol: Survol | null) => void
  onClic: (survol: Survol) => void
  /** Style chargé : les téléchargements qui attendaient la carte peuvent partir. */
  onPrete: () => void
  /** Vue d'ensemble (la métropole entière, ou presque, à l'écran) : celle des encarts. */
  onEnsemble: (ensemble: boolean) => void
  /** Zoom des bureaux atteint : le plan IGN est sous les couleurs (curseur d'opacité actif). */
  onPlan: (plan: boolean) => void
  /** Opacité des couleurs des bureaux sur le plan IGN, de 0,1 à 1. */
  opacite: number
  /** Repère de l'adresse choisie ([longitude, latitude]), tant que son territoire est affiché. */
  repere: [number, number] | null
  visite: VisiteAdresse | null
  /** Bureau trouvé sous l'adresse (null : aucun contour ne la contient ; undefined : la carte n'y est plus). */
  onBureauAdresse: (jeton: number, code: string | null | undefined) => void
  /** Ce qui est déplié sur la carte ou par-dessus : les cadrages lui laissent sa place (voir place.ts). */
  legendeRepliee: boolean
  encartsDeplies: boolean
  voletReplie: boolean
}

const [OUEST, SUD, EST, NORD] = FRANCE_METROPOLITAINE
const FRANCE: [[number, number], [number, number]] = [[OUEST, SUD], [EST, NORD]]
// Retrait des éléments posés sur la carte, tel que les `@media` de styles.css le fixent pour cet écran.
const retraitCarte = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cadre-carte')) || 24
const ecranDe = (element: HTMLElement): Ecran => ({
  largeur: element.clientWidth, hauteur: element.clientHeight, volet: enVolet(), retrait: retraitCarte(),
})
const margesDe = (carte: CarteMapLibre, place: Place, cadre: 'france' | 'territoire') => marges(place, ecranDe(carte.getContainer()), cadre)

// Territoire à surligner par son état (les circonscriptions ont leur couche, chargée pour les législatives). Une
// commune ou un arrondissement a son contour détaillé, à part.
function cible(selection: Selection): FeatureIdentifier | null {
  switch (selection.niveau) {
    case 'bureau': return { source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: selection.code }
    case 'circonscription': return { source: 'circonscriptions', id: selection.code }
    case 'departement': return { source: 'departements', id: selection.code }
    default: return null
  }
}

const aDesHachures = (etats: ReadonlyMap<string, Etat> | null | undefined) => {
  for (const etat of etats?.values() ?? []) if (etat.hachure) return true
  return false
}

// Couches que l'on survole et que l'on clique.
const COUCHES_ACTIVES = ['bureaux', 'communes', 'communes-repli', 'circonscriptions']

interface RepliCourant {
  repli: Repli | null
  /** États des bureaux de la carte au bureau ; null pour une carte à la commune. */
  bureaux: ReadonlyMap<string, Etat> | null
}

/**
 * Carte au bureau : territoire (commune ou arrondissement) que désigne un contour de 2022 montré à sa commune, parce
 * que ce numéro n'a pas de résultat à ce scrutin ou que le territoire a renuméroté ses bureaux ; undefined sinon.
 */
function territoireAuLieuDuBureau({ repli, bureaux }: RepliCourant, code: string) {
  const territoire = repli?.territoireDuContour.get(code)
  if (!repli || !territoire || !bureaux) return undefined
  return repli.aLaCommune.has(territoire) || !bureaux.has(code) ? territoire : undefined
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

export function Carte({
  coloriage, contours, auBureau, repli, circonscriptions, selection, contour, contourIndisponible, cadrage, libelle, onSurvol, onClic, onPrete,
  onEnsemble, onPlan, opacite, repere, visite, onBureauAdresse, legendeRepliee, encartsDeplies, voletReplie,
}: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  // Lue par les cadrages, dont ceux des écouteurs posés une fois pour toutes.
  const refPlace = useRef<Place>({ legendeRepliee, encartsDeplies, voletReplie })
  // Vue d'ensemble (la métropole entière à l'écran), tenue à jour à chaque fin de zoom.
  const refEnsemble = useRef(true)
  const refCarte = useRef<CarteMapLibre | null>(null)
  const refSelection = useRef<Selection | undefined>(undefined)
  const refPoses = useRef(new Map<string, ReadonlyMap<string, Etat>>())
  // États posés sur les bureaux, pour ne reposer que ceux qui changent.
  const refBureaux = useRef(new Map<string, Etat>())
  // Lus par le survol et la recherche d'adresse, dont les écouteurs sont posés une fois pour toutes.
  const refRepli = useRef<RepliCourant>({ repli: null, bureaux: null })
  useEffect(() => {
    refRepli.current = { repli, bureaux: coloriage?.bureaux ?? null }
  }, [repli, coloriage])

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
    // Cadrage porté par le lien (« #zoom/lat/lon », décision Q18), sinon la métropole entière.
    const cadre = lireCadre(window.location.hash)
    const carte = new CarteMapLibre({
      container: conteneur.current,
      style: STYLE,
      ...(cadre ? { center: cadre.centre, zoom: cadre.zoom }
        : { bounds: FRANCE, fitBoundsOptions: { padding: marges(refPlace.current, ecranDe(conteneur.current), 'france') } }),
      minZoom: 3,
      maxZoom: 16,
    })
    // Le cadrage vit dans le fragment de l'URL : noté à chaque fin de mouvement, sans créer d'entrée
    // d'historique ; Précédent et Suivant ramènent la carte à celui de leur vue. (L'option `hash` de MapLibre
    // efface le fragment quand la carte est détruite, ce que fait le double montage de StrictMode.)
    const cadreActuel = () => ecrireCadre({ zoom: carte.getZoom(), centre: carte.getCenter().toArray() })
    const noterCadre = () => {
      const fragment = cadreActuel()
      if (fragment !== window.location.hash) window.history.replaceState(window.history.state, '', fragment)
    }
    const suivreHistorique = (e: Event) => {
      // Nos propres changements d'URL (événement synthétique, même fragment) ne déplacent pas la carte.
      if (!e.isTrusted) return
      const voulu = lireCadre(window.location.hash)
      // Sans fragment, l'entrée précède tout mouvement de la carte : c'est l'accueil, sur la métropole entière.
      if (!voulu) carte.fitBounds(FRANCE, { padding: margesDe(carte, refPlace.current, 'france'), duration: 0 })
      else if (ecrireCadre(voulu) !== cadreActuel()) carte.jumpTo({ center: voulu.centre, zoom: voulu.zoom })
    }
    carte.on('moveend', noterCadre)
    window.addEventListener('popstate', suivreHistorique)
    window.addEventListener('hashchange', suivreHistorique)
    carte.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    // Motif des hachures, dessiné à la première demande (depuis MapLibre 6.11, l'événement
    // « styleimagemissing » arrive trop tard pour servir cette demande-là).
    carte.setMissingStyleImageResolver((id) => {
      if (id === 'hachures' && !carte.hasImage('hachures')) carte.addImage('hachures', motifHachures(), { pixelRatio: 2 })
    })
    // Limites départementales : tracé à 1 000 m pour la vue nationale, remplacé une fois pour toutes par
    // celui à 100 m (huit fois plus lourd) à l'approche du zoom des bureaux.
    const detaillerDepartements = () => {
      const source = carte.getSource<GeoJSONSource>('departements')
      if (!source || carte.getZoom() < ZOOM_BUREAUX - 1) return
      carte.off('zoomend', detaillerDepartements)
      source.setData(`${RACINE_DONNEES}/geo/departements-detail.geojson`)
    }
    carte.on('zoomend', detaillerDepartements)
    // Les résultats peuvent être appliqués dès que les sources existent : inutile d'attendre le
    // premier rendu complet ('load'), qui tarde quand l'onglet est en arrière-plan.
    carte.once('style.load', () => {
      setPrete(true)
      // Un lien peut ouvrir la carte déjà zoomée, sans mouvement qui déclencherait le tracé détaillé.
      detaillerDepartements()
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
    refCarte.current = carte
    if (import.meta.env.DEV) Object.assign(window, { carteAtlas: carte }) // inspection en développement
    return () => {
      window.removeEventListener('popstate', suivreHistorique)
      window.removeEventListener('hashchange', suivreHistorique)
      carte.remove()
      removeProtocol('pmtiles')
      refCarte.current = null
      setPrete(false)
    }
  }, [])

  // Vue d'ensemble : pas plus d'un niveau de zoom au-delà de la métropole entière, dont le zoom dépend de la
  // taille de l'écran.
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const signaler = () => {
      const france = carte.cameraForBounds(FRANCE, { padding: margesDe(carte, refPlace.current, 'france') })?.zoom
      refEnsemble.current = france === undefined || carte.getZoom() < france + 1
      onEnsemble(refEnsemble.current)
      onPlan(carte.getZoom() >= ZOOM_BUREAUX)
    }
    // Vue d'ensemble : quand la place change (panneau replié ou rouvert, fenêtre redimensionnée), la métropole
    // reste cadrée au mieux ; une carte zoomée sur un territoire, elle, ne bouge pas.
    const recadrer = () => {
      if (refEnsemble.current) carte.fitBounds(FRANCE, { padding: margesDe(carte, refPlace.current, 'france'), duration: 0 })
    }
    signaler()
    carte.on('zoomend', signaler)
    carte.on('resize', recadrer)
    return () => {
      carte.off('zoomend', signaler)
      carte.off('resize', recadrer)
    }
  }, [prete, onEnsemble, onPlan])

  // Légende, encarts ou volet du téléphone repliés ou dépliés : en vue d'ensemble, la métropole se recadre dans la
  // place libérée ou reprise. Seulement quand la place change : au premier affichage, le cadrage d'un lien partagé
  // l'emporte.
  useEffect(() => {
    const avant = refPlace.current
    refPlace.current = { legendeRepliee, encartsDeplies, voletReplie }
    const carte = refCarte.current
    if (!carte || !prete || !refEnsemble.current) return
    const voulues = margesDe(carte, refPlace.current, 'france')
    if (memesMarges(voulues, margesDe(carte, avant, 'france'))) return
    carte.fitBounds(FRANCE, { padding: voulues, duration: 300 })
  }, [prete, legendeRepliee, encartsDeplies, voletReplie])

  // Opacité des couleurs sur le plan, réglée par le curseur sous le zoom (les hachures, une texture, restent).
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    for (const couche of ['bureaux', 'communes-repli']) carte.setPaintProperty(couche, 'fill-opacity', opaciteSurPlan(opacite))
  }, [prete, opacite])

  // Communes sans aucun contour de bureau : dessinées au zoom des bureaux.
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    for (const couche of ['communes-repli', 'communes-repli-hachures']) carte.setFilter(couche, communesParmi(repli?.sansDessin ?? []))
  }, [prete, repli])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    carte.getSource<GeoJSONSource>('repere')?.setData(repere
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: repere }, properties: {} }
      : VIDE)
  }, [prete, repere])

  // Adresse choisie : la carte va jusqu'à la rue, puis, tuiles chargées (« idle »), lit le bureau dont le contour
  // (2022, indicatif) contient l'adresse. Une seule fois par adresse, même si la carte se redessine entre-temps ;
  // une nouvelle adresse annule l'attente de la précédente.
  const refVisite = useRef(0)
  const refAttente = useRef<(() => void) | null>(null)
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete || !visite || refVisite.current === visite.jeton) return
    refVisite.current = visite.jeton
    refAttente.current?.()
    // Décalage plutôt que `padding` : passée à flyTo, la marge resterait celle de la carte et s'ajouterait à
    // celle de tous les cadrages suivants, qui ne tiendraient plus dans l'écran (MapLibre y renonce en silence).
    const m = margesDe(carte, refPlace.current, 'territoire')
    carte.flyTo({
      center: [visite.lon, visite.lat], zoom: ZOOM_ADRESSE, offset: [(m.left - m.right) / 2, (m.top - m.bottom) / 2], duration: 900,
    })
    const lire = () => {
      refAttente.current = null
      // La carte a pu être déplacée pendant le vol : conclure seulement si l'adresse est à l'écran, au zoom des bureaux.
      if (carte.getZoom() < ZOOM_BUREAUX || !carte.getBounds().contains([visite.lon, visite.lat])) {
        onBureauAdresse(visite.jeton, undefined)
        return
      }
      const [trouve] = carte.queryRenderedFeatures(carte.project([visite.lon, visite.lat]), { layers: ['bureaux'] })
      const code = trouve?.properties?.codeBureauVote
      // Un contour montré à sa commune ne désigne pas un bureau de ce scrutin.
      onBureauAdresse(visite.jeton, typeof code === 'string' && !territoireAuLieuDuBureau(refRepli.current, code) ? code : null)
    }
    carte.once('idle', lire)
    refAttente.current = () => carte.off('idle', lire)
  }, [prete, visite, onBureauAdresse])

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
    // Paris, Lyon et Marseille : leurs arrondissements, dessinés par-dessus la ville, ont leurs propres
    // résultats. La ville n'est alors pas peinte : un arrondissement sans résultat doit rester vide.
    const decoupees = new Set<string>([...(coloriage.arrondissements?.keys() ?? [])].map(villeDe))
    const communes = new Map([...coloriage.communes].filter(([code]) => !decoupees.has(code)))
    for (const [code, etat] of coloriage.arrondissements ?? []) communes.set(code, etat)
    poser(carte, 'communes', communes)
    // Aux législatives, la vue nationale montre les circonscriptions à la place des communes.
    const parCirconscription = (coloriage.circonscriptions?.size ?? 0) > 0
    poser(carte, 'circonscriptions', coloriage.circonscriptions ?? new Map())
    // Hachures : une couche qui lit l'état de ses territoires se recalcule à chaque coloriage, même vide (0,8 s sur un
    // téléphone pour les communes) ; elle ne s'affiche que si le coloriage en a. L'afficher ou la masquer recharge sa
    // source : « En tête » et « Participation », qui n'en ont jamais, n'en paient rien.
    const hachuresCommunes = aDesHachures(communes)
    const visible = (oui: boolean) => (oui ? 'visible' : 'none')
    carte.setLayoutProperty('circonscriptions', 'visibility', visible(parCirconscription))
    carte.setLayoutProperty('circonscriptions-hachures', 'visibility', visible(parCirconscription && aDesHachures(coloriage.circonscriptions)))
    carte.setLayoutProperty('communes', 'visibility', visible(!parCirconscription))
    carte.setLayoutProperty('communes-hachures', 'visibility', visible(!parCirconscription && hachuresCommunes))
    carte.setLayoutProperty('communes-repli-hachures', 'visibility', visible(hachuresCommunes))
    // Un bureau a ses hachures, ou celles de la commune dont il prend l'état (carte à la commune, repli).
    carte.setLayoutProperty('bureaux-hachures', 'visibility', visible(aDesHachures(coloriage.bureaux) || hachuresCommunes))
    carte.setLayoutProperty('bureaux-contours', 'visibility', auBureau ? 'visible' : 'none')
    // Retirer des états a pu effacer la sélection : on la remet.
    const surlignee = refSelection.current && cible(refSelection.current)
    if (surlignee) carte.setFeatureState(surlignee, { selection: true })

    // Les 70 000 bureaux ne se voient qu'à partir du zoom des bureaux : leurs états ne sont posés qu'à
    // l'approche de ce zoom (dès le début de l'animation), par lots d'une image à l'autre pour ne pas figer
    // la page, et seulement pour les bureaux qui changent.
    let lance = false
    let image = 0
    const poserBureaux = () => {
      if (lance || carte.getZoom() < ZOOM_BUREAUX - 1) return
      lance = true
      const voulus = new Map<string, Etat>()
      if (coloriage.bureaux && repli && repli.territoireDuContour.size > 0) {
        // Un contour sans résultat à ce scrutin (bureau supprimé ou renuméroté depuis 2022), ou d'un territoire aux
        // bureaux renumérotés, prend la couleur de sa commune (de son arrondissement à Paris, Lyon et Marseille).
        for (const [code, territoire] of repli.territoireDuContour) {
          const propre = repli.aLaCommune.has(territoire) ? undefined : coloriage.bureaux.get(code)
          const duTerritoire = estArrondissement(territoire) ? coloriage.arrondissements?.get(territoire) : coloriage.communes.get(territoire)
          const etat = propre ?? (duTerritoire && { ...duTerritoire, commune: true })
          if (etat) voulus.set(code, etat)
        }
      } else if (coloriage.bureaux) {
        for (const [code, etat] of coloriage.bureaux) voulus.set(code, etat)
      } else {
        for (const { code_bv, code_commune } of contours) {
          // Un bureau de Paris, Lyon ou Marseille prend la couleur de son arrondissement, jamais de la ville.
          const arrondissement = arrondissementDu(code_bv)
          const etat = arrondissement ? coloriage.arrondissements?.get(arrondissement) : coloriage.communes.get(code_commune)
          if (etat) voulus.set(code_bv, etat)
        }
      }
      const poses = refBureaux.current
      const id = (code: string) => ({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: code })
      const aRetirer = [...poses.keys()].filter((code) => !voulus.has(code))
      const aPoser = [...voulus].filter(([code, etat]) => {
        const a = poses.get(code)
        return !a || a.couleur !== etat.couleur || a.opacite !== etat.opacite || a.hachure !== etat.hachure || a.commune !== etat.commune
      })
      const lot = () => {
        let n = 0
        while (n < 5000 && aRetirer.length > 0) {
          const code = aRetirer.pop() as string
          carte.removeFeatureState(id(code))
          poses.delete(code)
          n++
        }
        while (n < 5000 && aPoser.length > 0) {
          const [code, etat] = aPoser.pop() as [string, Etat]
          // setFeatureState complète l'état : le repli d'un coloriage précédent doit être levé explicitement.
          carte.setFeatureState(id(code), { ...etat, commune: etat.commune ?? false })
          poses.set(code, etat)
          n++
        }
        if (aRetirer.length > 0 || aPoser.length > 0) {
          image = requestAnimationFrame(lot)
        } else if (refSelection.current?.niveau === 'bureau') {
          carte.setFeatureState(id(refSelection.current.code), { selection: true })
        }
      }
      lot()
    }
    poserBureaux()
    carte.on('zoom', poserBureaux)
    return () => {
      carte.off('zoom', poserBureaux)
      cancelAnimationFrame(image)
    }
  }, [prete, coloriage, contours, auBureau, repli])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const precedente = refSelection.current && cible(refSelection.current)
    if (precedente) carte.removeFeatureState(precedente, 'selection')
    const nouvelle = selection ? cible(selection) : null
    if (nouvelle) carte.setFeatureState(nouvelle, { selection: true })
    refSelection.current = selection
    // Commune ou arrondissement : son contour détaillé, dès qu'il arrive ; le simplifié seulement s'il fait défaut
    // (changer le filtre recharge toutes les communes : jamais à chaque sélection).
    const commune = selection?.niveau === 'commune' || selection?.niveau === 'arrondissement' ? selection.code : undefined
    carte.getSource<GeoJSONSource>('contour')?.setData(commune && contour ? contour : VIDE)
    carte.setFilter('communes-selection', communesParmi(commune && !contour && contourIndisponible ? [commune] : []))
  }, [prete, selection, contour, contourIndisponible])

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
    const padding = margesDe(carte, refPlace.current, estFrance(cadrage.emprise) ? 'france' : 'territoire')
    carte.fitBounds([[ouest, sud], [est, nord]], { padding, maxZoom: 13, duration: 600 })
  }, [prete, cadrage])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const territoire = (e: MapLayerMouseEvent): Survol | null => {
      const p = e.features?.[0]?.properties
      if (!p) return null
      const position = { x: e.point.x, y: e.point.y, largeur: carte.getContainer().clientWidth }
      const couche = e.features?.[0]?.layer.id
      const aLaCommune = (code: string) => ({ niveau: estArrondissement(code) ? 'arrondissement' : 'commune', code, ...position } as const)
      if (couche === 'communes' || couche === 'communes-repli') return aLaCommune(p.code)
      if (couche === 'circonscriptions') return { niveau: 'circonscription', code: p.code, ...position }
      if (auBureau) {
        const territoire = territoireAuLieuDuBureau(refRepli.current, p.codeBureauVote)
        return territoire ? aLaCommune(territoire) : { niveau: 'bureau', code: p.codeBureauVote, ...position }
      }
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
    for (const couche of COUCHES_ACTIVES) {
      carte.on('mousemove', couche, survol)
      carte.on('mouseenter', couche, entrer)
      carte.on('mouseleave', couche, quitter)
      carte.on('click', couche, clic)
    }
    return () => {
      for (const couche of COUCHES_ACTIVES) {
        carte.off('mousemove', couche, survol)
        carte.off('mouseenter', couche, entrer)
        carte.off('mouseleave', couche, quitter)
        carte.off('click', couche, clic)
      }
    }
  }, [prete, auBureau, onSurvol, onClic])

  return <div ref={conteneur} className="carte" role="region" aria-label={libelle} />
}
