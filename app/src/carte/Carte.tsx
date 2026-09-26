import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import {
  Map as CarteMapLibre, NavigationControl, Point, addProtocol, removeProtocol, setWorkerUrl,
  type FeatureIdentifier, type GeoJSONSource, type MapMouseEvent, type MapSourceDataEvent, type PointLike,
} from 'maplibre-gl'
import urlWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
// Styles des contrôles de la carte : chargés avec elle, pas avant (ils ne bloquent plus le premier affichage).
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Feature, FeatureCollection } from 'geojson'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import { RACINE_DONNEES } from '../donnees/requetes'
import { arrondissementDu, departementDe, estArrondissement, villeDe } from '../donnees/territoires'
import type { BureauContour, Correctifs } from '../donnees/types'
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
// Libellés des contrôles de MapLibre, lus par les lecteurs d'écran et affichés au survol : en français.
const LIBELLES_MAPLIBRE = {
  'Map.Title': 'Carte : flèches pour se déplacer, plus et moins pour zoomer, Entrée pour choisir le territoire au centre',
  'NavigationControl.ZoomIn': 'Zoomer',
  'NavigationControl.ZoomOut': 'Dézoomer',
  'NavigationControl.ResetBearing': 'Remettre le nord en haut',
  'AttributionControl.ToggleAttribution': 'Afficher ou masquer les sources',
  'AttributionControl.MapFeedback': 'Signaler une erreur de la carte',
}
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
// Commune sans contour de 2022 que dessine son découpage local (Alès) : sa couleur ne se mêle pas à celle de ses bureaux.
const saufLocale = (opacite: ExpressionSpecification): ExpressionSpecification =>
  ['case', ['boolean', ['feature-state', 'locale'], false], 0, opacite]
const opaciteRepli = (opacite: number) => saufLocale(opaciteSurPlan(opacite))
// Commune sélectionnée, faute de contour détaillé.
const communesParmi = (codes: Iterable<string>): FilterSpecification => ['in', ['get', 'code'], ['literal', [...codes]]]
// Contours locaux des territoires qu'ils dessinent à ce scrutin (quelques centaines au plus).
const bureauxParmi = (codes: Iterable<string>): FilterSpecification => ['in', ['get', 'code_bv'], ['literal', [...codes]]]
const COUCHES_LOCALES = ['correctifs', 'correctifs-hachures', 'correctifs-contours', 'correctifs-selection']
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
    // Contours locaux des bureaux, là où ceux de 2022 manquent, sont faux ou ne suivent plus : chargés au besoin.
    correctifs: {
      type: 'geojson', data: VIDE, promoteId: 'code_bv', attribution: 'Bureaux locaux : collectivités, C. Rossi ; Rennes Métropole (ODbL)',
    },
    // Contour détaillé des communes sans aucun contour de bureau (Troyes, Belfort…), chargé au besoin.
    'communes-sans-contour': { type: 'geojson', data: VIDE, promoteId: 'code' },
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
    // Au zoom des bureaux, une commune qui n'a aucun contour de bureau (Troyes, Belfort…) reste dessinée, à sa couleur,
    // par son contour détaillé (le contour simplifié de la vue nationale n'a parfois que sept points).
    {
      id: 'communes-repli', type: 'fill', source: 'communes-sans-contour', minzoom: ZOOM_BUREAUX,
      paint: { ...REMPLISSAGE, 'fill-opacity': opaciteRepli(OPACITE_SUR_PLAN) },
    },
    {
      id: 'communes-repli-hachures', type: 'fill', source: 'communes-sans-contour', minzoom: ZOOM_BUREAUX,
      paint: { ...HACHURES, 'fill-opacity': saufLocale(HACHURES['fill-opacity']) }, layout: { visibility: 'none' },
    },
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
    // Contours locaux, par-dessus ceux de 2022 qu'ils remplacent (ceux-là deviennent alors transparents). Filtrés sur
    // les territoires qu'ils dessinent à ce scrutin : invisibles, les autres répondraient encore au survol.
    {
      id: 'correctifs', type: 'fill', source: 'correctifs', minzoom: ZOOM_BUREAUX, filter: bureauxParmi([]), paint: REMPLISSAGE_SUR_PLAN,
      layout: { visibility: 'none' },
    },
    {
      id: 'correctifs-hachures', type: 'fill', source: 'correctifs', minzoom: ZOOM_BUREAUX, filter: bureauxParmi([]), paint: HACHURES,
      layout: { visibility: 'none' },
    },
    {
      id: 'correctifs-contours', type: 'line', source: 'correctifs', minzoom: 10, filter: bureauxParmi([]), layout: { visibility: 'none' },
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
    // Contour simplifié d'une commune ou d'un arrondissement, en secours du contour détaillé : par un filtre, pas par
    // l'état des communes, que chaque coloriage recalcule pour toute couche qui le lit (0,5 s sur un téléphone).
    { id: 'communes-selection', type: 'line', source: 'communes', filter: communesParmi([]), paint: { 'line-color': ENCRE, 'line-width': 2.5 } },
    { id: 'circonscriptions-selection', type: 'line', source: 'circonscriptions', paint: siSelection(2.5) },
    { id: 'bureaux-selection', type: 'line', source: 'bureaux', 'source-layer': COUCHE_BUREAUX, minzoom: ZOOM_BUREAUX, paint: siSelection(3) },
    { id: 'correctifs-selection', type: 'line', source: 'correctifs', minzoom: ZOOM_BUREAUX, filter: bureauxParmi([]), paint: siSelection(3) },
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
  /** Désigné au clavier (réticule au centre de la carte) : annoncé au lecteur d'écran. */
  clavier?: boolean
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
  /** Contours locaux des bureaux (Bordeaux Métropole, Ville de Paris…), pour les territoires que le repli leur confie. */
  correctifs: Correctifs | null
  /** Emprise de chaque département : les états des bureaux ne sont posés que pour ceux à l'écran. */
  emprisesDepartements: Emprises
  /** Première approche du zoom des bureaux : ce qui ne se voit qu'à ce zoom peut se télécharger. */
  onApprocheBureaux: () => void
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
// commune ou un arrondissement a son contour détaillé, à part ; un bureau, le contour local de sa commune s'il en a un.
function cible(selection: Selection, repli: Repli | null): FeatureIdentifier | null {
  switch (selection.niveau) {
    case 'bureau': {
      const territoire = repli?.territoireDuCorrectif.get(selection.code)
      if (territoire && repli?.corriges.has(territoire)) return { source: 'correctifs', id: selection.code }
      return { source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: selection.code }
    }
    case 'circonscription': return { source: 'circonscriptions', id: selection.code }
    case 'departement': return { source: 'departements', id: selection.code }
    default: return null
  }
}

const aDesHachures = (etats: ReadonlyMap<string, Etat> | null | undefined) => {
  for (const etat of etats?.values() ?? []) if (etat.hachure) return true
  return false
}

/** Emprise d'un département : [ouest, sud, est, nord]. */
export type Emprises = ReadonlyMap<string, readonly [number, number, number, number]>

/**
 * Départements à l'écran, marge d'un quart de l'écran comprise, parmi ceux qui ont des bureaux ; sans emprise
 * connue (index pas encore arrivé), un département est compté d'office.
 */
function departementsEnVue(carte: CarteMapLibre, emprises: Emprises, candidats: Iterable<string>): Set<string> {
  const b = carte.getBounds()
  const dx = (b.getEast() - b.getWest()) / 4
  const dy = (b.getNorth() - b.getSouth()) / 4
  const enVue = new Set<string>()
  for (const departement of candidats) {
    const e = emprises.get(departement)
    if (!e || (e[2] >= b.getWest() - dx && e[0] <= b.getEast() + dx && e[3] >= b.getSouth() - dy && e[1] <= b.getNorth() + dy)) {
      enVue.add(departement)
    }
  }
  return enVue
}

// Couches que l'on survole et que l'on clique ; sous le pointeur, la plus haute l'emporte.
const COUCHES_ACTIVES = ['correctifs', 'bureaux', 'communes-repli', 'communes', 'circonscriptions']
// Contour de 2022 d'un territoire que dessine son découpage local : transparent, sans tracé.
const CACHE: Etat = { couleur: FOND_CARTE, opacite: 0, hachure: false, commune: true }

interface RepliCourant {
  repli: Repli | null
  /** États des bureaux de la carte au bureau ; null pour une carte à la commune. */
  bureaux: ReadonlyMap<string, Etat> | null
}

/**
 * Carte au bureau : territoire (commune ou arrondissement) que désigne un contour de 2022 montré à sa commune, parce
 * que ce numéro n'a pas de résultat à ce scrutin ou que le territoire a renuméroté ses bureaux ; undefined sinon.
 */
/** Contour de 2022 effacé : son territoire est dessiné par son découpage local. Le survol regarde dessous. */
const efface = (repli: Repli | null, code: unknown) =>
  typeof code === 'string' && repli !== null && repli.corriges.has(repli.territoireDuContour.get(code) ?? '')

function territoireAuLieuDuBureau({ repli, bureaux }: RepliCourant, code: string) {
  const territoire = repli?.territoireDuContour.get(code)
  if (!repli || !territoire || !bureaux) return undefined
  return repli.aLaCommune.has(territoire) || repli.corriges.has(territoire) || !bureaux.has(code) ? territoire : undefined
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
  coloriage, contours, auBureau, repli, correctifs, emprisesDepartements, onApprocheBureaux, circonscriptions, selection, contour, contourIndisponible, cadrage, libelle, onSurvol, onClic, onPrete,
  onEnsemble, onPlan, opacite, repere, visite, onBureauAdresse, legendeRepliee, encartsDeplies, voletReplie,
}: Props) {
  const conteneur = useRef<HTMLDivElement>(null)
  // Lue par les cadrages, dont ceux des écouteurs posés une fois pour toutes.
  const refPlace = useRef<Place>({ legendeRepliee, encartsDeplies, voletReplie })
  // Vue d'ensemble (la métropole entière à l'écran), tenue à jour à chaque fin de zoom.
  const refEnsemble = useRef(true)
  const refCarte = useRef<CarteMapLibre | null>(null)
  // Élément surligné : sa source (bureaux de 2022 ou contours locaux) dépend du repli du moment.
  const refCible = useRef<FeatureIdentifier | null>(null)
  const refPoses = useRef(new Map<string, ReadonlyMap<string, Etat>>())
  // États posés sur les bureaux, pour ne reposer que ceux qui changent.
  const refBureaux = useRef(new Map<string, Etat>())
  // Lus par le survol et la recherche d'adresse, dont les écouteurs sont posés une fois pour toutes.
  const refRepli = useRef<RepliCourant>({ repli: null, bureaux: null })
  const refEmprises = useRef<Emprises>(new Map())
  useEffect(() => {
    refEmprises.current = emprisesDepartements
  }, [emprisesDepartements])
  useEffect(() => {
    refRepli.current = { repli, bureaux: coloriage?.bureaux ?? null }
  }, [repli, coloriage])

  /**
   * États d'une source, posés en ne touchant qu'aux territoires qui changent : MapLibre met près d'une
   * seconde (plusieurs sur un téléphone) à poser 35 000 états, souvent identiques d'un coloriage à l'autre
   * (les bureaux qui arrivent après les communes, par exemple).
   */
  function poser(carte: CarteMapLibre, source: 'communes' | 'circonscriptions' | 'communes-sans-contour', etats: ReadonlyMap<string, Etat>) {
    const avant = refPoses.current.get(source) ?? new Map<string, Etat>()
    for (const code of avant.keys()) if (!etats.has(code)) carte.removeFeatureState({ source, id: code })
    for (const [code, etat] of etats) {
      const a = avant.get(code)
      if (!a || a.couleur !== etat.couleur || a.opacite !== etat.opacite || a.hachure !== etat.hachure || a.locale !== etat.locale) {
        carte.setFeatureState({ source, id: code }, { ...etat, locale: etat.locale ?? false })
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
      locale: LIBELLES_MAPLIBRE,
    })
    // Au clavier, la carte se parcourt comme une application : le lecteur d'écran lui laisse les flèches. Pas de
    // rotation (Maj et flèches) : la carte reste le nord en haut.
    carte.getCanvas().setAttribute('role', 'application')
    carte.getCanvas().setAttribute('aria-roledescription', 'carte')
    carte.keyboard.disableRotation()
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
    for (const couche of ['bureaux', 'correctifs']) carte.setPaintProperty(couche, 'fill-opacity', opaciteSurPlan(opacite))
    carte.setPaintProperty('communes-repli', 'fill-opacity', opaciteRepli(opacite))
  }, [prete, opacite])

  // À l'approche du zoom des bureaux, le seul où ils se voient : contours détaillés des communes sans contour de
  // bureau, et (par l'application) contours locaux. Une seule fois.
  const refApproche = useRef(false)
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const approcher = () => {
      if (refApproche.current || carte.getZoom() < ZOOM_BUREAUX - 2) return
      refApproche.current = true
      carte.getSource<GeoJSONSource>('communes-sans-contour')?.setData(`${RACINE_DONNEES}/geo/communes_sans_contour.geojson`)
      onApprocheBureaux()
    }
    approcher()
    carte.on('zoom', approcher)
    return () => {
      carte.off('zoom', approcher)
    }
  }, [prete, onApprocheBureaux])

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
      const { repli: r, bureaux } = refRepli.current
      const trouve = carte.queryRenderedFeatures(carte.project([visite.lon, visite.lat]), { layers: ['correctifs', 'bureaux'] })
        .find((f) => f.layer.id !== 'bureaux' || !efface(r, f.properties?.codeBureauVote))
      if (trouve?.layer.id === 'correctifs') {
        const code = String(trouve.properties?.code_bv)
        const territoire = r?.territoireDuCorrectif.get(code)
        onBureauAdresse(visite.jeton, bureaux?.has(code) && !(territoire && r?.aLaCommune.has(territoire)) ? code : null)
        return
      }
      const code = trouve?.properties?.codeBureauVote
      // Un contour montré à sa commune ne désigne pas un bureau de ce scrutin.
      onBureauAdresse(visite.jeton, typeof code === 'string' && !territoireAuLieuDuBureau(refRepli.current, code) ? code : null)
    }
    carte.once('idle', lire)
    refAttente.current = () => carte.off('idle', lire)
  }, [prete, visite, onBureauAdresse])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    carte.getSource<GeoJSONSource>('correctifs')?.setData(correctifs ?? VIDE)
  }, [prete, correctifs])

  // Contours locaux des seuls territoires qu'ils dessinent à ce scrutin. Changer le filtre recharge la source, mais
  // elle est petite ; un filtre inchangé (même liste) ne recharge rien.
  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    const codes = [...(repli?.territoireDuCorrectif ?? [])].filter(([, territoire]) => repli?.corriges.has(territoire)).map(([code]) => code)
    for (const couche of COUCHES_LOCALES) carte.setFilter(couche, bureauxParmi(codes))
  }, [prete, repli])

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
    // Communes sans aucun contour de bureau : leur contour détaillé, à leur couleur ; pas peint sous le découpage local
    // qui en dessine les bureaux (Alès).
    const sansContour = new Map<string, Etat>()
    for (const code of repli?.sansDessin ?? []) {
      const etat = communes.get(code)
      if (etat) sansContour.set(code, repli?.corriges.has(code) ? { ...etat, locale: true } : etat)
    }
    poser(carte, 'communes-sans-contour', sansContour)
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
    // Contours locaux : seulement si le repli leur confie un territoire à ce scrutin ; leur tracé, au bureau seulement.
    const locaux = (repli?.corriges.size ?? 0) > 0
    carte.setLayoutProperty('correctifs', 'visibility', visible(locaux))
    carte.setLayoutProperty('correctifs-contours', 'visibility', visible(auBureau && locaux))
    carte.setLayoutProperty('correctifs-hachures', 'visibility', visible(locaux && (aDesHachures(coloriage.bureaux) || hachuresCommunes)))
    // Retirer des états a pu effacer la sélection : on la remet.
    if (refCible.current) carte.setFeatureState(refCible.current, { selection: true })

    // Les 70 000 bureaux ne se voient qu'à partir du zoom des bureaux. Leurs états ne sont posés que pour les
    // départements à l'écran et autour, à l'approche de ce zoom (dès le début de l'animation), puis au fil des
    // déplacements : MapLibre confronte chaque état posé à chaque tuile chargée, et 70 000 états figeaient un
    // téléphone plusieurs secondes à chaque coloriage. Par lots d'une image à l'autre, seulement ceux qui changent.
    const poses = refBureaux.current
    const id = (code: string) => ({ source: 'bureaux', sourceLayer: COUCHE_BUREAUX, id: code })
    const duTerritoire = (territoire: string) =>
      estArrondissement(territoire) ? coloriage.arrondissements?.get(territoire) : coloriage.communes.get(territoire)
    const calculerVoulus = () => {
      const voulus = new Map<string, Etat>()
      if (coloriage.bureaux && repli && repli.territoireDuContour.size > 0) {
        // Un contour sans résultat à ce scrutin (bureau supprimé ou renuméroté depuis 2022), ou d'un territoire aux
        // bureaux renumérotés, prend la couleur de sa commune (de son arrondissement à Paris, Lyon et Marseille).
        for (const [code, territoire] of repli.territoireDuContour) {
          if (repli.corriges.has(territoire)) {
            voulus.set(code, CACHE)
            continue
          }
          const propre = repli.aLaCommune.has(territoire) ? undefined : coloriage.bureaux.get(code)
          const commune = duTerritoire(territoire)
          const etat = propre ?? (commune && { ...commune, commune: true })
          if (etat) voulus.set(code, etat)
        }
      } else if (coloriage.bureaux) {
        for (const [code, etat] of coloriage.bureaux) voulus.set(code, etat)
      } else {
        for (const { code_bv, code_commune } of contours) {
          // Contour de 2022 faux, remplacé par le découpage local : effacé.
          if (efface(repli, code_bv)) {
            voulus.set(code_bv, CACHE)
            continue
          }
          // Un bureau de Paris, Lyon ou Marseille prend la couleur de son arrondissement, jamais de la ville.
          const arrondissement = arrondissementDu(code_bv)
          const etat = arrondissement ? coloriage.arrondissements?.get(arrondissement) : coloriage.communes.get(code_commune)
          if (etat) voulus.set(code_bv, etat)
        }
      }
      // Découpage local : ses bureaux d'après leurs résultats ; la commune (l'arrondissement) pour un numéro sans
      // résultat, un territoire montré en entier ou une carte à la commune.
      for (const [code, territoire] of repli?.territoireDuCorrectif ?? []) {
        const local = { source: 'correctifs', id: code }
        const propre = repli?.aLaCommune.has(territoire) ? undefined : coloriage.bureaux?.get(code)
        const etat = repli?.corriges.has(territoire) ? propre ?? duTerritoire(territoire) : undefined
        if (etat) carte.setFeatureState(local, { ...etat, commune: false, selection: false })
        else carte.removeFeatureState(local)
      }
      if (refCible.current?.source === 'correctifs') carte.setFeatureState(refCible.current, { selection: true })
      return voulus
    }
    let parDepartement: Map<string, [string, Etat][]> | null = null
    const departementsPoses = new Set<string>()
    let premier = true
    let image = 0
    const aRetirer: string[] = []
    const aPoser: [string, Etat][] = []
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
      } else if (refCible.current?.source === 'bureaux') {
        carte.setFeatureState(refCible.current, { selection: true })
      }
    }
    const poserBureaux = () => {
      if (carte.getZoom() < ZOOM_BUREAUX - 1) return
      if (!parDepartement) {
        parDepartement = new Map()
        for (const entree of calculerVoulus()) {
          const departement = departementDe(entree[0].split('_')[0])
          const liste = parDepartement.get(departement)
          if (liste) liste.push(entree)
          else parDepartement.set(departement, [entree])
        }
      }
      const nouveaux = [...departementsEnVue(carte, refEmprises.current, parDepartement.keys())].filter((d) => !departementsPoses.has(d))
      if (!premier && nouveaux.length === 0) return
      const voulus = new Map<string, Etat>()
      for (const departement of nouveaux) {
        departementsPoses.add(departement)
        for (const [code, etat] of parDepartement.get(departement) ?? []) voulus.set(code, etat)
      }
      if (premier) {
        premier = false
        // États d'un coloriage précédent hors de l'écran : retirés, reposés quand on y va.
        for (const code of poses.keys()) if (!voulus.has(code)) aRetirer.push(code)
      }
      for (const [code, etat] of voulus) {
        const a = poses.get(code)
        if (!a || a.couleur !== etat.couleur || a.opacite !== etat.opacite || a.hachure !== etat.hachure || a.commune !== etat.commune) {
          aPoser.push([code, etat])
        }
      }
      cancelAnimationFrame(image)
      lot()
    }
    poserBureaux()
    carte.on('zoom', poserBureaux)
    carte.on('moveend', poserBureaux)
    return () => {
      carte.off('zoom', poserBureaux)
      carte.off('moveend', poserBureaux)
      cancelAnimationFrame(image)
    }
  }, [prete, coloriage, contours, auBureau, repli])

  useEffect(() => {
    const carte = refCarte.current
    if (!carte || !prete) return
    if (refCible.current) carte.removeFeatureState(refCible.current, 'selection')
    const nouvelle = selection ? cible(selection, repli) : null
    if (nouvelle) carte.setFeatureState(nouvelle, { selection: true })
    refCible.current = nouvelle
    // Commune ou arrondissement : son contour détaillé, dès qu'il arrive ; le simplifié seulement s'il fait défaut
    // (changer le filtre recharge toutes les communes : jamais à chaque sélection).
    const commune = selection?.niveau === 'commune' || selection?.niveau === 'arrondissement' ? selection.code : undefined
    carte.getSource<GeoJSONSource>('contour')?.setData(commune && contour ? contour : VIDE)
    carte.setFilter('communes-selection', communesParmi(commune && !contour && contourIndisponible ? [commune] : []))
  }, [prete, selection, contour, contourIndisponible, repli])

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
    const territoire = (point: PointLike & { x: number; y: number }): Survol | null => {
      const { repli: r, bureaux } = refRepli.current
      const f = carte.queryRenderedFeatures(point, { layers: COUCHES_ACTIVES })
        .find((f) => f.layer.id !== 'bureaux' || !efface(r, f.properties?.codeBureauVote))
      const p = f?.properties
      if (!f || !p) return null
      const position = { x: point.x, y: point.y, largeur: carte.getContainer().clientWidth }
      const aLaCommune = (code: string) => ({ niveau: estArrondissement(code) ? 'arrondissement' : 'commune', code, ...position } as const)
      switch (f.layer.id) {
        case 'communes': case 'communes-repli': return aLaCommune(p.code)
        case 'circonscriptions': return { niveau: 'circonscription', code: p.code, ...position }
        case 'correctifs': {
          // Un numéro du découpage local sans résultat à ce scrutin, ou d'un territoire montré en entier, désigne sa commune.
          const commune = r?.territoireDuCorrectif.get(p.code_bv)
          return commune && (!bureaux?.has(p.code_bv) || r?.aLaCommune.has(commune))
            ? aLaCommune(commune)
            : { niveau: 'bureau', code: p.code_bv, ...position }
        }
      }
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
    const survol = (e: MapMouseEvent) => {
      const t = territoire(e.point)
      carte.getCanvas().style.cursor = t ? 'pointer' : ''
      onSurvol(t)
    }
    const quitter = () => {
      carte.getCanvas().style.cursor = ''
      onSurvol(null)
    }
    const clic = (e: MapMouseEvent) => {
      const t = territoire(e.point)
      if (t) onClic(t)
    }
    // Clavier (flèches, plus et moins, ceux de MapLibre) : un réticule marque le centre de la partie visible de la
    // carte ; le territoire dessous s'affiche et s'annonce, Entrée le choisit. Rien pour une carte prise à la souris.
    const canvas = carte.getCanvas()
    const reticule = document.createElement('div')
    reticule.className = 'reticule-carte'
    reticule.hidden = true
    carte.getContainer().appendChild(reticule)
    const centre = () => {
      const m = margesDe(carte, refPlace.current, 'territoire')
      const { clientWidth: l, clientHeight: h } = carte.getContainer()
      return new Point(m.left + Math.max(0, l - m.left - m.right) / 2, m.top + Math.max(0, h - m.top - m.bottom) / 2)
    }
    const suivreCentre = () => {
      reticule.hidden = !canvas.matches(':focus-visible')
      if (reticule.hidden) return
      const c = centre()
      reticule.style.left = `${c.x}px`
      reticule.style.top = `${c.y}px`
      const t = territoire(c)
      onSurvol(t && { ...t, clavier: true })
    }
    const quitterClavier = () => {
      if (reticule.hidden) return
      reticule.hidden = true
      onSurvol(null)
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const t = territoire(centre())
      if (!t) return
      e.preventDefault()
      onClic({ ...t, clavier: true })
    }
    carte.on('mousemove', survol)
    carte.on('mouseout', quitter)
    carte.on('click', clic)
    canvas.addEventListener('focus', suivreCentre)
    canvas.addEventListener('blur', quitterClavier)
    canvas.addEventListener('keydown', touche)
    carte.on('moveend', suivreCentre)
    carte.on('resize', suivreCentre)
    return () => {
      carte.off('mousemove', survol)
      carte.off('mouseout', quitter)
      carte.off('click', clic)
      canvas.removeEventListener('focus', suivreCentre)
      canvas.removeEventListener('blur', quitterClavier)
      canvas.removeEventListener('keydown', touche)
      carte.off('moveend', suivreCentre)
      carte.off('resize', suivreCentre)
      reticule.remove()
    }
  }, [prete, auBureau, onSurvol, onClic])

  return <div ref={conteneur} className="carte" role="region" aria-label={libelle} />
}
