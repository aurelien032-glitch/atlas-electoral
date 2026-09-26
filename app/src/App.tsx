import type { Feature } from 'geojson'
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Cadrage, Emprises, Survol, VisiteAdresse } from './carte/Carte'
import { Encarts } from './carte/Encarts'
import {
  LIBELLE_BLOC, PALETTE_EVOLUTION, RAMPE_PARTICIPATION, RAMPE_SCORE, SEUILS_EVOLUTION, palier, type BlocColore,
} from './carte/couleurs'
import { Infobulle } from './carte/Infobulle'
import { Legende, type DescriptionLegende } from './carte/Legende'
import { ReglageOpacite } from './carte/Opacite'
import { Onglets } from './carte/Onglets'
import { enVolet, FRANCE_METROPOLITAINE, repliParDefaut } from './carte/place'
import {
  repli, territoiresDesContours, territoiresDesCorrectifs, territoiresDesSources, territoiresRemplaces, territoiresSansDessin, type Repli,
} from './carte/repli'

import { blocEnTete, optionsCibles, retenueDuBloc } from './cibles'
import { nomCandidature } from './donnees/libelles'
import {
  useAgregats, useAgregatsVoix, useBureaux, useCandidats, useCatalogue, useCirconscriptions, useContourCommune, useContours, useCorrectifs,
  useCodesPostaux, useDepartements, useEncarts, usePanachage, usePassage, useSeriesCommunes, useSeriesTerritoires,
  useTerritoires, useVoix,
} from './donnees/requetes'
import {
  arrondissementDu, communeDu, departementDe, emprise, indexer, lesArrondissements, secteurDe, selectionDeCommune, titreDe,
  villeDe,
} from './donnees/territoires'
import {
  plusieursElections, raisonPlusieursElections, scrutinParDefaut, scrutinPrecedent, scrutinsAnterieurs, voteParSecteur,
} from './donnees/scrutins'
import {
  exprimesPourParts, type Agregat, type BureauContour, type Candidature, type Correctifs, type Encart, type Resultat, type Territoire,
  type VoixPanachage,
} from './donnees/types'
import type { Mesure } from './calculs/parts'
import { formatEcart, formatPart, formatPourcent, unitePoints } from './format'
import {
  LIBELLES_EVOLUTION, LIBELLE_MODE, classesLegende, coloriageClasses, coloriageTete, couleursPour, ecartsAuNiveau, partDe,
  partsAuNiveau, seuilsDe, valeursEvolution, valeursParticipation, valeursScore, type Coloriage, type Mode, type Valeurs,
} from './modes'
import { Apercu, type ApercuEvolution } from './panneau/Apercu'
import { Chronologie } from './panneau/Chronologie'
import { SANS_DEPART, type Actions, type Contexte } from './panneau/contexte'
import { Detail, EnteteFiche, type Parent } from './panneau/Detail'
import { Methodologie } from './panneau/Methodologie'
import { Reglages } from './panneau/Reglages'
import type { Adresse } from './recherche/adresses'
import { indexerCodesPostaux, preparer } from './recherche/chercher'
import { Recherche } from './recherche/Recherche'
import { Chevron } from './Chevron'
import { garderOpacite, garderRepli, opaciteGardee, repliGarde } from './preferences'
import { useUrl } from './url'
import { ecrireSelection, lireCadre, lireVue, type Selection } from './vue'


/** Candidat d'une commune au panachage, sous la forme des candidatures publiées. */
const candidatureDuPanachage = (l: VoixPanachage): Candidature => ({
  cand: l.cand, portee: 'commune', panneau: null, nom: l.nom, prenom: l.prenom, liste: null, liste_abregee: null,
  nuance: l.nuance ?? 'NC', nuance_libelle: null, origine_nuance: l.nuance && l.nuance !== 'NC' ? 'officielle' : 'aucune', famille: '', bloc: l.bloc ?? 'NC',
  cas_limite: false, sexe: l.sexe, circonscription: null, elu: null, voix_total: 0,
})

/** Voix par candidature des lignes retenues d'un fichier du panachage. */
function voixDuPanachage(lignes: readonly VoixPanachage[]) {
  const sommes = new Map<number, number>()
  for (const l of lignes) sommes.set(l.cand, (sommes.get(l.cand) ?? 0) + l.voix)
  return [...sommes].map(([cand, voix]) => ({ cand, voix }))
}

// MapLibre (270 Ko compressés) arrive après l'application : le panneau et ses chiffres s'affichent sans
// attendre que la carte soit prête.
const Carte = lazy(() => import('./carte/Carte').then((m) => ({ default: m.Carte })))
// Référence stable : un tableau vide recréé à chaque rendu relancerait tout le coloriage de la carte.
const AUCUN_CONTOUR: BureauContour[] = []
/** Fenêtres posées sur la carte qui réduisent le volet à sa barre, le temps de les lire. */
type Reduction = 'encarts' | 'legende'
/** Territoires hors de la métropole, accessibles depuis l'aperçu : départements et collectivités d'outre-mer,
 * Français établis hors de France (« ZZ »). */
const HORS_METROPOLE = ['971', '972', '973', '974', '976', '975', '977', '978', '986', '987', '988', 'ZZ']

interface EtatCarte {
  coloriage: Coloriage
  legende: DescriptionLegende | null
  valeurs: Valeurs | null
}
// Carte vidée (aucun territoire peint) : référence stable, comme tout ce qui est passé à la carte.
const COLORIAGE_VIDE: Coloriage = { communes: new Map(), bureaux: null }

/** Adresse choisie dans la recherche, et ce qu'on a trouvé sous elle. */
interface AdresseChoisie {
  adresse: Adresse
  jeton: number
  /** Territoire montré pour l'adresse : sa commune (ou son arrondissement) d'abord, son bureau une fois trouvé. */
  selection: Selection
  /** Recherche du bureau sous l'adresse : en cours, faite, ou abandonnée (on est passé à autre chose). */
  etat: 'recherche' | 'faite' | 'abandon'
  /** Bureau dont le contour de 2022 contient l'adresse ; null : aucun. */
  bureau?: string | null
}

/** Carte qui ne peut pas s'afficher (fragment non reçu, WebGL indisponible) : le panneau reste utilisable. */
class GardeCarte extends Component<{ children: ReactNode; onEchec: () => void }, { echec: boolean }> {
  state = { echec: false }
  static getDerivedStateFromError() {
    return { echec: true }
  }
  componentDidCatch() {
    this.props.onEchec()
  }
  render() {
    return this.state.echec
      ? <p className="alerte carte-indisponible" role="alert">La carte n'a pas pu s'afficher : rechargez la page. Les résultats restent consultables dans le panneau.</p>
      : this.props.children
  }
}

interface PropsZone {
  /** La carte démarre après les premiers chiffres : MapLibre et ses contours ne leur disputent ni le réseau ni le processeur. */
  lancee: boolean
  coloriage: Coloriage | null
  contours: BureauContour[]
  auBureau: boolean
  repli: Repli | null
  correctifs: Correctifs | null
  emprisesDepartements: Emprises
  circonscriptions: boolean
  selection: Selection | undefined
  contour: Feature | undefined
  contourIndisponible: boolean
  cadrage: Cadrage | null
  libelle: string
  contenu: (survol: Survol) => { titre: string; lignes: string[] }
  onClic: (survol: Survol) => void
  /** Vue nationale : encarts de la petite couronne et de l'outre-mer. */
  encarts: Encart[] | undefined
  onChoisirEncart: (selection: Selection) => void
  onCadrer: (emprise: [number, number, number, number]) => void
  encartsReplies: boolean
  /** Bouton des encarts, sous ◐ : hors de la vue d'ensemble, il ramène à la France entière. */
  onBoutonEncarts: (ensemble: boolean) => void
  /** Carte prête, ou en échec : ce qui attendait la carte peut se télécharger. */
  onPrete: () => void
  /** Légende repliée, volet du téléphone réduit à sa barre : la carte cadre dans la place laissée. */
  legendeRepliee: boolean
  voletReplie: boolean
  /** Adresse choisie : son repère, la visite de la carte et le bureau trouvé (voir Carte). */
  repere: [number, number] | null
  visite: VisiteAdresse | null
  onBureauAdresse: (jeton: number, code: string | null | undefined) => void
}

// Le survol change à chaque mouvement de souris : son état vit ici, pour ne pas recalculer les panneaux.
function ZoneCarte({
  lancee, contenu, encarts, onChoisirEncart, onCadrer, encartsReplies, onBoutonEncarts, onPrete, ...props
}: PropsZone) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  // Encarts dépliés : seulement dans la vue d'ensemble. Une fois la carte zoomée sur une région, ils la
  // masqueraient sans rien lui apprendre ; leur bouton, lui, reste, pour revenir à la France entière.
  const [ensemble, setEnsemble] = useState(true)
  // Opacité des couleurs sur le plan IGN : préférence gardée par le navigateur. Le curseur n'agit qu'au zoom des
  // bureaux, là où le plan est dessous.
  const [opacite, setOpacite] = useState(opaciteGardee)
  const [plan, setPlan] = useState(false)
  const changerOpacite = useCallback((valeur: number) => {
    setOpacite(valeur)
    garderOpacite(valeur)
  }, [])
  const bulle = survol && contenu(survol)
  return (
    <div className="zone-carte-fond">
      {lancee && (
        <GardeCarte onEchec={onPrete}>
          <Suspense fallback={null}>
            <Carte
              {...props} onSurvol={setSurvol} onPrete={onPrete} onEnsemble={setEnsemble} onPlan={setPlan} opacite={opacite}
              encartsDeplies={!encartsReplies}
            />
          </Suspense>
        </GardeCarte>
      )}
      {encarts && (
        <Encarts
          encarts={encarts} coloriage={props.coloriage} onSurvol={setSurvol} onChoisir={onChoisirEncart} onCadrer={onCadrer}
          parCirconscription={props.circonscriptions && (props.coloriage?.circonscriptions?.size ?? 0) > 0}
          replies={!ensemble || encartsReplies}
          libelle={ensemble ? undefined : "Revenir à la France entière, avec la petite couronne et l'outre-mer"}
          onBasculer={() => onBoutonEncarts(ensemble)}
        />
      )}
      {lancee && <ReglageOpacite valeur={opacite} actif={plan} onChange={changerOpacite} />}
      {survol && bulle && <Infobulle x={survol.x} y={survol.y} largeur={survol.largeur} titre={bulle.titre} lignes={bulle.lignes} />}
    </div>
  )
}

export default function App() {
  const [parametres, modifierUrl] = useUrl()
  const vue = useMemo(() => lireVue(parametres), [parametres])
  const [cadrage, setCadrage] = useState<Cadrage | null>(null)
  const [selectionInitiale] = useState(() => lireVue(new URLSearchParams(window.location.search)).selection)
  // Volet déplié (mobile) dès qu'un territoire est choisi : par la carte, la recherche ou un lien partagé.
  const [deplie, setDeplie] = useState(selectionInitiale !== undefined)
  // Panneau replié pour lire la carte en grand : ôté sur ordinateur (une languette le rouvre), réduit à une fine
  // barre sur téléphone. Choisir un territoire le rouvre, pour montrer sa fiche.
  const [panneauReplie, setPanneauReplie] = useState(() => repliGarde('panneau', false))
  // Dans le volet, une fenêtre posée sur la carte qui n'y tient pas (encarts, légende dépliée) le réduit à sa barre
  // le temps de la lire, sans que ce repli soit gardé ; il remonte quand plus aucune ne l'y oblige.
  const [voletReduitPour, setVoletReduitPour] = useState<ReadonlySet<Reduction>>(() => new Set())
  const voletReplie = panneauReplie || voletReduitPour.size > 0
  const reduireVolet = useCallback((pour: Reduction) => setVoletReduitPour((avant) => new Set(avant).add(pour)), [])
  const rendreVolet = useCallback((pour: Reduction) => setVoletReduitPour((avant) => {
    if (!avant.has(pour)) return avant
    const apres = new Set(avant)
    apres.delete(pour)
    return apres
  }), [])
  const replierPanneau = useCallback((replie: boolean) => {
    setPanneauReplie(replie)
    garderRepli('panneau', replie)
    if (!replie) setVoletReduitPour(new Set())
  }, [])
  // Encarts repliés sur leur bouton, sauf sur grand écran : dépliés, ils prennent à la métropole 300 px de large.
  // Dans le volet, ils s'ouvrent en plein cadre sur la carte, au-dessus du volet (décision Q23).
  const [encartsReplies, setEncartsReplies] = useState(() => repliGarde('encarts', repliParDefaut('encarts', window.innerWidth, enVolet())))
  const replierEncarts = useCallback((replies: boolean) => {
    setEncartsReplies(replies)
    garderRepli('encarts', replies)
  }, [])
  const [legendeRepliee, setLegendeRepliee] = useState(() => repliGarde('legende', repliParDefaut('legende', window.innerWidth, enVolet())))
  const basculerLegende = useCallback(() => {
    setLegendeRepliee(!legendeRepliee)
    garderRepli('legende', !legendeRepliee)
    if (!legendeRepliee) {
      rendreVolet('legende')
      return
    }
    if (!enVolet()) return
    // Dans le volet, une seule fenêtre à la fois sur la carte : la légende referme les encarts (sans changer la
    // préférence gardée). Dépliée (le rendu du clic est fait au tour suivant), si elle ne tient pas au-dessus du
    // volet, il se réduit le temps de la lire.
    if (!encartsReplies) {
      setEncartsReplies(true)
      rendreVolet('encarts')
    }
    setTimeout(() => {
      const legende = document.querySelector('.legende-carte')
      if (legende && legende.scrollHeight > legende.clientHeight + 1) reduireVolet('legende')
    }, 0)
  }, [legendeRepliee, encartsReplies, reduireVolet, rendreVolet])

  const catalogue = useCatalogue()
  const scrutins = useMemo(() => catalogue.data?.scrutins ?? [], [catalogue.data])
  const scrutin = scrutins.find((s) => s.id === vue.scrutin) ?? scrutinParDefaut(scrutins)
  const id = scrutin?.id
  const auBureau = scrutin?.jointure_contours?.niveau_carte === 'bureau'
  // L'évolution se lit à la commune : les numéros de bureaux changent d'un scrutin à l'autre.
  const carteAuBureau = auBureau && vue.mode !== 'evolution'
  const selection = vue.selection

  const agregats = useAgregats(id)
  const candidats = useCandidats(id)
  const chiffresPrets = agregats.isSuccess && candidats.isSuccess
  // Ordre des téléchargements : les chiffres du panneau, puis la carte (qui reste ensuite, d'un scrutin à
  // l'autre), puis ce qui peut attendre qu'elle soit prête (index complet, historique, bureaux).
  const [carteLancee, setCarteLancee] = useState(false)
  if (chiffresPrets && !carteLancee) setCarteLancee(true)
  const [carteChargee, setCarteChargee] = useState(false)
  const signalerCarte = useCallback(() => setCarteChargee(true), [])
  // Bureaux (70 000 lignes) : tout de suite pour la fiche d'un bureau, sinon après la carte.
  const bureaux = useBureaux((selection?.niveau === 'bureau' ? chiffresPrets : carteChargee && auBureau) ? id : undefined)
  const agregatsVoix = useAgregatsVoix(vue.mode === 'score' || vue.mode === 'evolution' || selection ? id : undefined)
  const voix = useVoix((vue.mode === 'score' && carteAuBureau) || selection?.niveau === 'bureau' ? id : undefined)
  // Contours de 2022 (bureau → commune) : une carte à la commune en colore les bureaux ; une carte au bureau y lit,
  // une fois prête, où montrer la commune faute de contour.
  const contours = useContours(chiffresPrets && (!carteAuBureau || carteChargee))
  // Contours locaux des bureaux (Bordeaux, Paris Centre, Alès…), une fois la carte prête : certains remplacent des
  // contours de 2022 faux, à tout scrutin.
  const correctifs = useCorrectifs(chiffresPrets && carteChargee)
  const encarts = useEncarts(chiffresPrets)
  // Recherche, préparée à la première utilisation du champ (normaliser 35 000 noms prend du temps) : à
  // pertinence égale, les communes qui comptent le plus d'inscrits passent devant.
  const [rechercheActive, setRechercheActive] = useState(false)
  // Dans le volet, le champ monte en haut de l'écran : ses suggestions tiennent au-dessus du clavier.
  const activerRecherche = useCallback(() => {
    setRechercheActive(true)
    if (enVolet()) setDeplie(true)
  }, [])
  // Index des territoires : les départements suffisent à la vue nationale ; les 35 000 communes (600 Ko)
  // viennent après la carte, sauf pour un lien vers un territoire, qui attend son nom, ou pour la recherche.
  const departements = useDepartements()
  const territoires = useTerritoires(carteChargee || selection !== undefined || rechercheActive)
  const communesNommees = territoires.data !== undefined
  const passage = usePassage()
  const circonscriptions = useCirconscriptions(scrutin?.portee === 'circonscription' ? id : undefined)
  const contourCommune = useContourCommune(selection?.niveau === 'commune' || selection?.niveau === 'arrondissement' ? selection.code : undefined)

  const scrutinDe = vue.mode === 'evolution' && scrutin
    ? scrutinsAnterieurs(scrutins, scrutin).find((s) => s.id === vue.de) ?? scrutinPrecedent(scrutins, scrutin)
    : undefined
  const agregatsDe = useAgregats(scrutinDe?.id)
  const candidatsDe = useCandidats(scrutinDe?.id)
  const agregatsVoixDe = useAgregatsVoix(scrutinDe?.id)

  const parCand = useMemo(() => new Map((candidats.data ?? []).map((c) => [c.cand, c])), [candidats.data])
  const index = useMemo(
    () => indexer(territoires.data ?? departements.data ?? [], passage.data, circonscriptions.data),
    [territoires.data, departements.data, passage.data, circonscriptions.data],
  )
  // Faute de contour de bureau, la carte montre la commune : villes absentes des contours de 2022, bureaux créés ou
  // renumérotés depuis (décision du 26/09).
  const territoireDuContour = useMemo(() => contours.data && territoiresDesContours(contours.data), [contours.data])
  const sansDessin = useMemo(
    () => territoireDuContour && territoiresSansDessin(territoireDuContour, index.territoires.values()),
    [territoireDuContour, index.territoires],
  )
  const territoireDuCorrectif = useMemo(
    () => territoiresDesCorrectifs((correctifs.data?.features ?? []).map((f) => f.properties.code_bv)),
    [correctifs.data],
  )
  // Un découpage local ne dessine que les scrutins à partir de son année.
  const anneeScrutin = scrutin ? Number(scrutin.date.slice(0, 4)) : 0
  const correctifsValables = useMemo(
    () => territoiresDesSources(correctifs.data?.sources ?? [], anneeScrutin),
    [correctifs.data, anneeScrutin],
  )
  // Contours de 2022 faux (le dernier bureau d'Aimargues couvre Alès) : remplacés à tout scrutin.
  const remplaces = useMemo(() => territoiresRemplaces(correctifs.data?.sources ?? []), [correctifs.data])
  const repliCarte = useMemo(
    () => territoireDuContour && sansDessin
      ? repli(territoireDuContour, sansDessin, carteAuBureau ? bureaux.data ?? null : null, (code) => communeDu(code, index.passage),
        territoireDuCorrectif, correctifsValables, remplaces)
      : null,
    [territoireDuContour, sansDessin, carteAuBureau, bureaux.data, index.passage, territoireDuCorrectif, correctifsValables, remplaces],
  )
  // Emprise de chaque département : au zoom des bureaux, la carte ne pose les états que de ceux à l'écran.
  const emprisesDepartements = useMemo((): Emprises => new Map([...index.territoires.values()]
    .filter((t) => t.niveau === 'departement')
    .flatMap((t) => {
      const e = emprise(t)
      return e ? [[t.code, e] as const] : []
    })), [index.territoires])
  // Découpages locaux employés à ce scrutin, cités dans la légende et la fiche.
  const sourcesLocales = useMemo(
    () => (correctifs.data?.sources ?? []).filter((s) => s.territoires.some((t) => repliCarte?.corriges.has(t))),
    [correctifs.data, repliCarte],
  )
  // Municipales jusqu'en 2020 : dans les petites communes, on vote pour des personnes (panachage). Leurs
  // candidats sont publiés à part, un fichier par département, chargé à l'ouverture de la fiche.
  const communesPanachage = useMemo(
    () => new Set((agregats.data ?? []).filter((a) => a.niveau === 'commune' && a.panachage).map((a) => a.code)),
    [agregats.data],
  )
  const communeChoisie = selection?.niveau === 'commune' ? selection.code
    : selection?.niveau === 'bureau' ? communeDu(selection.code, index.passage) : undefined
  const auPanachage = communeChoisie !== undefined && communesPanachage.has(communeChoisie)
  const panachage = usePanachage(auPanachage ? id : undefined, auPanachage ? departementDe(communeChoisie) : undefined)

  // Au fil des scrutins : la France, un département ou une circonscription viennent d'un seul petit
  // fichier ; une commune (ou la commune d'un bureau), du fichier de son département.
  const arrondissementDuBureau = selection?.niveau === 'bureau' ? arrondissementDu(selection.code) : undefined
  const niveauSerie = !selection ? 'france'
    : selection.niveau === 'bureau' ? (arrondissementDuBureau ? 'arrondissement' : 'commune') : selection.niveau
  const codeSerie = !selection ? 'FR' : arrondissementDuBureau ?? communeChoisie ?? selection.code
  const seriesTerritoires = useSeriesTerritoires(niveauSerie !== 'commune' && chiffresPrets && (carteChargee || selection !== undefined))
  const seriesCommunes = useSeriesCommunes(niveauSerie === 'commune' ? departementDe(codeSerie) : undefined)
  const serie = niveauSerie === 'commune' ? seriesCommunes : seriesTerritoires
  const lignesSerie = useMemo(
    () => serie.data?.filter((l) => l.code === codeSerie && (l.niveau ?? 'commune') === niveauSerie),
    [serie.data, codeSerie, niveauSerie],
  )
  const cibles = useMemo(() => optionsCibles(scrutin, candidats.data), [scrutin, candidats.data])
  const entreesRecherche = useMemo(() => {
    if (!rechercheActive) return []
    const inscrits = new Map((agregats.data ?? []).filter((a) => a.niveau === 'commune' || a.niveau === 'arrondissement').map((a) => [a.code, a.inscrits]))
    // L'index contient départements, communes et, aux législatives, circonscriptions (« rhône 2e »).
    return preparer([...index.territoires.values()], inscrits)
  }, [rechercheActive, agregats.data, index])
  // Codes postaux : chargés eux aussi à la première utilisation du champ.
  const codesPostaux = useCodesPostaux(rechercheActive)
  const postaux = useMemo(
    () => codesPostaux.data && indexerCodesPostaux(codesPostaux.data, entreesRecherche),
    [codesPostaux.data, entreesRecherche],
  )
  const cible = cibles.find((c) => c.valeur === vue.cible) ?? cibles[0]
  const bloc: BlocColore = vue.bloc ?? blocEnTete(candidats.data) ?? 'DTE'

  const evolution = useMemo(() => {
    if (!agregats.data || !agregatsVoix.data || !candidats.data) return null
    if (!agregatsDe.data || !agregatsVoixDe.data || !candidatsDe.data) return null
    return {
      avant: { agregats: agregatsDe.data, agregatsVoix: agregatsVoixDe.data, retenue: retenueDuBloc(candidatsDe.data, bloc) },
      apres: { agregats: agregats.data, agregatsVoix: agregatsVoix.data, retenue: retenueDuBloc(candidats.data, bloc) },
    }
  }, [agregats.data, agregatsVoix.data, candidats.data, agregatsDe.data, agregatsVoixDe.data, candidatsDe.data, bloc])

  const etatCarte = useMemo((): EtatCarte | null => {
    if (!scrutin || !agregats.data || !candidats.data) return null
    const communes = agregats.data.filter((a) => a.niveau === 'commune')
    // En tête : les communes se colorent sans attendre les bureaux (chargés ensuite). Les autres modes les
    // attendent, car leurs classes se calculent sur les bureaux.
    const chargementBureaux = carteAuBureau && bureaux.data === undefined
    if (chargementBureaux && vue.mode !== 'tete') return null
    const listeBureaux = carteAuBureau ? bureaux.data ?? null : null
    const unite = listeBureaux ? 'bureaux' : 'communes'
    // Seuils pondérés par les inscrits (participation) ou les exprimés (score) du niveau le plus fin de la carte.
    const seuilsSur = (fines: ReadonlyMap<string, Mesure>, champ: 'exprimes' | 'inscrits') => listeBureaux
      ? seuilsDe(fines, listeBureaux, (b) => b.code_bv, (b) => b[champ])
      : seuilsDe(fines, communes, (c) => c.code, (c) => c[champ])
    switch (vue.mode) {
      case 'tete': {
        const blocDe = (cand: number) => parCand.get(cand)?.bloc ?? 'NC'
        return { coloriage: coloriageTete(agregats.data, listeBureaux, blocDe), valeurs: null, legende: { type: 'tete' } }
      }
      case 'participation': {
        const valeurs = valeursParticipation(agregats.data, listeBureaux)
        const fines = valeurs.bureaux ?? valeurs.communes
        const seuils = seuilsSur(fines, 'inscrits')
        const couleurs = couleursPour(RAMPE_PARTICIPATION, seuils.length + 1)
        return {
          coloriage: coloriageClasses(valeurs, seuils, couleurs),
          valeurs,
          legende: {
            type: 'classes', titre: 'Participation', sousTitre: `Part des inscrits qui ont voté · nombre de ${unite}`,
            ...classesLegende(fines, seuils, couleurs), libelleSansObjet: '',
          },
        }
      }
      case 'score': {
        if (!cible || !agregatsVoix.data || (listeBureaux && !voix.data)) return null
        const valeurs = valeursScore(agregats.data, agregatsVoix.data, listeBureaux && voix.data ? { liste: listeBureaux, voix: voix.data } : null, cible.retenue)
        const fines = valeurs.bureaux ?? valeurs.communes
        const seuils = seuilsSur(fines, 'exprimes')
        const couleurs = couleursPour(RAMPE_SCORE[cible.teinte], seuils.length + 1)
        return {
          coloriage: coloriageClasses(valeurs, seuils, couleurs),
          valeurs,
          legende: {
            type: 'classes', titre: cible.libelle, sousTitre: `Part des exprimés · nombre de ${unite}`,
            ...classesLegende(fines, seuils, couleurs), libelleSansObjet: 'Aucune candidature du bloc',
          },
        }
      }
      case 'evolution': {
        // Premier scrutin de l'atlas : rien à comparer, la carte reste vide (le panneau dit pourquoi).
        if (!scrutinDe) return { coloriage: COLORIAGE_VIDE, valeurs: null, legende: null }
        if (!evolution) return null
        const valeurs = valeursEvolution(evolution.avant, evolution.apres) // communes seulement
        return {
          coloriage: coloriageClasses(valeurs, SEUILS_EVOLUTION, PALETTE_EVOLUTION),
          valeurs,
          legende: {
            type: 'classes', titre: 'Écart, en points', sousTitre: `${LIBELLE_BLOC[bloc]} · nombre de communes`,
            ...classesLegende(valeurs.communes, SEUILS_EVOLUTION, PALETTE_EVOLUTION, LIBELLES_EVOLUTION),
            libelleSansObjet: 'Non comparable',
          },
        }
      }
    }
  }, [scrutin, agregats.data, candidats.data, bureaux.data, agregatsVoix.data, voix.data, carteAuBureau, vue.mode, cible, evolution, scrutinDe, bloc, parCand])

  // Sous la légende : jusqu'où la carte descend, et ce qu'elle montre là où les contours de bureaux manquent.
  const noteContours = useMemo(() => {
    const j = scrutin?.jointure_contours
    if (!j || vue.mode === 'evolution') return undefined
    const part = (x: number) => `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
    return j.niveau_carte === 'commune'
      ? `Carte à la commune : les contours de bureaux datent de 2022 et ne couvrent que ${part(j.taux_inscrits_metropole)} des inscrits de métropole à ce scrutin.`
      : `Contours des bureaux de 2022 : il en manque pour ${part(1 - j.taux_inscrits_metropole)} des inscrits de métropole ; la carte montre alors leur commune.${
        sourcesLocales.map((s) => ` ${s.lieu} : ${s.titre} (${s.nom}).`).join('')}`
  }, [scrutin, vue.mode, sourcesLocales])

  const apercuEvolution = useMemo((): ApercuEvolution | undefined => {
    if (vue.mode !== 'evolution' || !evolution || !scrutinDe || !etatCarte?.valeurs) return undefined
    const { avant, apres } = evolution
    const france = (d: typeof avant) => partsAuNiveau(d.agregats, d.agregatsVoix, 'france', d.retenue).get('FR') ?? null
    let sansObjet = 0
    for (const v of etatCarte.valeurs.communes.values()) if (v === null) sansObjet++
    return {
      de: scrutinDe,
      france: [france(avant), france(apres)],
      departements: ecartsAuNiveau(avant, apres, 'departement'),
      communesSansObjet: sansObjet,
    }
  }, [vue.mode, evolution, scrutinDe, etatCarte])

  // Index pour l'infobulle du mode « Tête ».
  const resultats = useMemo(() => ({
    bureaux: new Map<string, Resultat>((bureaux.data ?? []).map((b) => [b.code_bv, b])),
    communes: new Map<string, Resultat>((agregats.data ?? []).filter((a) => a.niveau === 'commune').map((a) => [a.code, a])),
    circonscriptions: new Map<string, Resultat>((agregats.data ?? []).filter((a) => a.niveau === 'circonscription').map((a) => [a.code, a])),
    arrondissements: new Map<string, Resultat>((agregats.data ?? []).filter((a) => a.niveau === 'arrondissement').map((a) => [a.code, a])),
  }), [bureaux.data, agregats.data])

  // Agrégat d'une commune ou d'un arrondissement, pour l'infobulle (bloc le plus voté des territoires à
  // plusieurs élections).
  const agregatsParCode = useMemo(() => new Map((agregats.data ?? [])
    .filter((a) => a.niveau === 'commune' || a.niveau === 'arrondissement').map((a) => [`${a.niveau}:${a.code}`, a])), [agregats.data])
  const agregatDe = useCallback((niveau: string, code: string) => agregatsParCode.get(`${niveau}:${code}`), [agregatsParCode])

  const contenuInfobulle = useCallback((survol: Survol) => {
    // Les noms des communes arrivent avec l'index complet, juste après la carte : pas de code INSEE en attendant.
    const nomAttendu = !communesNommees && survol.niveau !== 'circonscription'
    const titre = nomAttendu ? 'Chargement du nom…' : titreDe({ niveau: survol.niveau, code: survol.code }, index)
    // Bureaux demandés après la carte : pas de « Pas de résultat » pendant leur téléchargement.
    if (survol.niveau === 'bureau' && bureaux.data === undefined && !bureaux.error) return { titre, lignes: ['Chargement des résultats…'] }
    const lignes: string[] = []
    if (survol.niveau === 'commune' && communesPanachage.has(survol.code) && vue.mode !== 'participation') {
      lignes.push('Vote pour des personnes (panachage)')
    } else if (survol.niveau === 'commune' && scrutin && voteParSecteur(scrutin, survol.code) && vue.mode === 'tete') {
      lignes.push('Vote par secteur : résultats additionnés, voir la fiche')
    } else if (vue.mode === 'tete' && scrutin && (survol.niveau === 'commune' || survol.niveau === 'arrondissement')
      && plusieursElections(scrutin, survol.niveau, survol.code, resultats[survol.niveau === 'commune' ? 'communes' : 'arrondissements'].get(survol.code))) {
      const a = agregatDe(survol.niveau, survol.code)
      if (a?.bloc_en_tete && a.egalite_bloc) lignes.push('Égalité entre les deux premiers blocs')
      else if (a?.bloc_en_tete) {
        const avance = a.avance_bloc_x10000 ?? 0
        lignes.push(`Bloc le plus voté : ${LIBELLE_BLOC[a.bloc_en_tete]}`, `Avance ${palier(avance).libelle}, ${formatEcart(avance / 100).replace('+', '')} pts`)
      }
      lignes.push(`${raisonPlusieursElections(scrutin).replace(/^./, (c) => c.toUpperCase())} : voir la fiche`)
    } else if (vue.mode === 'tete') {
      const r = resultats[({
        bureau: 'bureaux', commune: 'communes', arrondissement: 'arrondissements', circonscription: 'circonscriptions',
      } as const)[survol.niveau]].get(survol.code)
      const tete = r?.tete != null ? parCand.get(r.tete) : undefined
      if (!r || r.exprimes === 0 || !tete) lignes.push('Pas de résultat à ce scrutin')
      else if (r.egalite) lignes.push('Égalité en tête')
      else {
        const avance = r.avance_x10000 ?? 0
        lignes.push(`En tête : ${nomCandidature(tete)}`, `${LIBELLE_BLOC[tete.bloc]} · avance ${palier(avance).libelle}, ${formatEcart(avance / 100).replace('+', '')} pts`)
      }
    } else if (etatCarte?.valeurs) {
      const v = survol.niveau === 'bureau' ? etatCarte.valeurs.bureaux?.get(survol.code)
        : survol.niveau === 'circonscription' ? etatCarte.valeurs.circonscriptions?.get(survol.code)
          : survol.niveau === 'arrondissement' ? etatCarte.valeurs.arrondissements?.get(survol.code)
            : etatCarte.valeurs.communes.get(survol.code)
      if (v === undefined) lignes.push('Pas de résultat à ce scrutin')
      else if (v === null) lignes.push(vue.mode === 'evolution' ? 'Non comparable' : 'Aucune candidature du bloc')
      else lignes.push(vue.mode === 'evolution' ? `${formatEcart(v)} ${unitePoints(v)}` : formatPourcent(v))
    }
    return { titre, lignes }
  }, [vue.mode, resultats, parCand, etatCarte, index, communesNommees, communesPanachage, scrutin, bureaux.data, bureaux.error, agregatDe])

  const actions: Actions = useMemo(() => ({
    scrutin: (valeur) => modifierUrl({ scrutin: valeur, cible: null }),
    cible: (valeur) => modifierUrl({ cible: valeur }),
    bloc: (valeur) => modifierUrl({ bloc: valeur }),
    de: (valeur) => modifierUrl({ de: valeur }),
    territoire: (s) => {
      modifierUrl({ sel: ecrireSelection(s), page: null })
      if (s?.niveau === 'bureau') return
      const zone = s ? emprise(index.territoires.get(s.code)) : FRANCE_METROPOLITAINE
      if (zone) setCadrage({ emprise: zone, jeton: Date.now() })
    },
  }), [modifierUrl, index])

  // Un lien partagé qui sélectionne un territoire cadre la carte dessus, au chargement seulement : ensuite,
  // seul le panneau recadre (un clic sur la carte montre un territoire déjà à l'écran). Un lien qui porte le
  // cadrage de la carte (« #zoom/lat/lon ») le garde : c'est celui qu'on a partagé.
  const [cadreDansLien] = useState(() => lireCadre(window.location.hash) !== null)
  const cadrageInitial = useMemo((): Cadrage | null => {
    if (!selectionInitiale || cadreDansLien) return null
    const s = selectionInitiale
    const zone = emprise(index.territoires.get(s.niveau === 'bureau' ? communeDu(s.code, index.passage) : s.code))
    return zone && { emprise: zone, jeton: 0 }
  }, [selectionInitiale, cadreDansLien, index])

  const choisirSurCarte = useCallback((survol: Survol) => {
    modifierUrl({ sel: ecrireSelection({ niveau: survol.niveau, code: survol.code }), page: null })
    setDeplie(true)
    replierPanneau(false)
  }, [modifierUrl, replierPanneau])

  const allerA = useCallback((t: Territoire) => {
    actions.territoire({ niveau: t.niveau, code: t.code })
    setDeplie(true)
    replierPanneau(false)
  }, [actions, replierPanneau])

  // Adresse choisie dans la recherche : sa commune (ou son arrondissement) s'affiche aussitôt, dans une nouvelle
  // entrée d'historique, où la carte note ensuite le cadrage de la rue ; la fiche ne dépend donc pas de la carte.
  // Une fois la carte arrivée, le bureau dont le contour contient l'adresse précise cette même entrée.
  const [adresseChoisie, setAdresseChoisie] = useState<AdresseChoisie | null>(null)
  // Copies lues au retour de la carte, qui arrive après la fin du vol (le scrutin a pu changer entre-temps).
  const refAdresse = useRef<AdresseChoisie | null>(null)
  const refAuBureau = useRef(auBureau)
  useEffect(() => {
    refAuBureau.current = auBureau
  }, [auBureau])
  const retenirAdresse = useCallback((a: AdresseChoisie) => {
    refAdresse.current = a
    setAdresseChoisie(a)
  }, [])
  const choisirAdresse = useCallback((adresse: Adresse) => {
    const selection = selectionDeCommune(adresse.commune)
    retenirAdresse({ adresse, jeton: Date.now(), selection, etat: 'recherche' })
    modifierUrl({ sel: ecrireSelection(selection), page: null })
    setDeplie(true)
    replierPanneau(false)
  }, [retenirAdresse, modifierUrl, replierPanneau])
  // Bureau lu sous l'adresse ; undefined : la carte n'était plus sur l'adresse.
  const trouverBureau = useCallback((jeton: number, code: string | null | undefined) => {
    const a = refAdresse.current
    if (!a || a.jeton !== jeton || a.etat !== 'recherche') return
    const actuelle = lireVue(new URLSearchParams(window.location.search)).selection
    if (code === undefined || actuelle?.niveau !== a.selection.niveau || actuelle.code !== a.selection.code) {
      retenirAdresse({ ...a, etat: 'abandon' }) // on est passé à autre chose : rien ne change sous ses yeux
      return
    }
    // Carte à la commune (avant 2022) : les contours de 2022 ne désignent pas les bureaux de ce scrutin.
    const selection: Selection = code && refAuBureau.current ? { niveau: 'bureau', code } : a.selection
    retenirAdresse({ ...a, selection, etat: 'faite', bureau: code })
    if (selection !== a.selection) modifierUrl({ sel: ecrireSelection(selection) }, true)
  }, [retenirAdresse, modifierUrl])
  // Secours : une carte qui ne répond pas (échec, onglet en arrière-plan) ne laisse pas la fiche en attente.
  useEffect(() => {
    if (adresseChoisie?.etat !== 'recherche') return
    const { jeton } = adresseChoisie
    const minuteur = setTimeout(() => {
      const a = refAdresse.current
      if (a?.jeton === jeton && a.etat === 'recherche') retenirAdresse({ ...a, etat: 'abandon' })
    }, 20000)
    return () => clearTimeout(minuteur)
  }, [adresseChoisie, retenirAdresse])
  const visite = useMemo((): VisiteAdresse | null => adresseChoisie && {
    lon: adresseChoisie.adresse.lon, lat: adresseChoisie.adresse.lat, jeton: adresseChoisie.jeton,
  }, [adresseChoisie])
  // Le repère et le rappel de l'adresse accompagnent le territoire qu'elle a fait choisir ; un autre territoire
  // les efface, Précédent les retrouve.
  const selectionAdresse = adresseChoisie?.selection
  const adresseAffichee = adresseChoisie && selection?.niveau === selectionAdresse?.niveau
    && selection?.code === selectionAdresse?.code ? adresseChoisie : null
  const repere = useMemo((): [number, number] | null =>
    adresseAffichee && [adresseAffichee.adresse.lon, adresseAffichee.adresse.lat], [adresseAffichee])
  // Le rappel dit ce qui relie l'adresse au territoire pour le scrutin affiché, qui a pu changer depuis.
  const noteAdresse = useMemo(() => {
    if (!adresseAffichee) return undefined
    const { adresse, selection: s, etat, bureau } = adresseAffichee
    const lieu = s.niveau === 'arrondissement' ? "l'arrondissement" : 'la commune'
    let suite = ''
    if (!scrutin) suite = ''
    else if (s.niveau === 'bureau') {
      suite = !auBureau
        ? "Bureau trouvé d'après les contours de 2022 : pour ce scrutin, ce numéro a pu désigner un autre bureau."
        : `Bureau dont le contour de 2022 (indicatif) la contient.${adresse.type === 'housenumber' ? ''
          : " Sans numéro, le repère marque un point de la voie : le bureau peut changer d'un numéro à l'autre."}`
    } else if (!auBureau) suite = `Pour ce scrutin, la carte s'arrête à ${lieu}.`
    else if (etat === 'recherche') suite = 'Recherche de son bureau de vote…'
    else if (etat === 'faite' && bureau === null) suite = `Aucun contour de bureau de 2022 ne la relie à un bureau de ce scrutin : résultats de ${lieu}.`
    return `Adresse recherchée : ${adresse.libelle}.${suite && ` ${suite}`}`
  }, [adresseAffichee, scrutin, auBureau])

  const lienMethodologie = useMemo(() => {
    const p = new URLSearchParams(parametres)
    p.set('page', 'methodologie')
    return `?${p}`
  }, [parametres])

  const cadrer = useCallback((emprise: [number, number, number, number]) => setCadrage({ emprise, jeton: Date.now() }), [])
  // Bouton des encarts : hors de la vue d'ensemble (zoomée sur la Martinique, une commune…), il ramène à la France
  // entière, encarts dépliés sur ordinateur (la carte leur fait place) ; dans le volet, refermés, car en plein
  // cadre ils la cacheraient. Dans la vue d'ensemble, il les déplie ou les replie ; dans le volet, ouverts en plein
  // cadre, ils prennent tout l'écran au-dessus de sa barre.
  const boutonEncarts = useCallback((ensemble: boolean) => {
    const volet = enVolet()
    if (!ensemble) {
      cadrer(FRANCE_METROPOLITAINE)
      replierEncarts(volet)
      if (volet) rendreVolet('encarts')
      return
    }
    replierEncarts(!encartsReplies)
    if (!volet) return
    if (!encartsReplies) {
      rendreVolet('encarts')
      return
    }
    reduireVolet('encarts')
    // Une seule fenêtre à la fois sur la carte : les encarts referment la légende (sans changer la préférence gardée).
    if (!legendeRepliee) {
      setLegendeRepliee(true)
      rendreVolet('legende')
    }
  }, [encartsReplies, legendeRepliee, cadrer, replierEncarts, reduireVolet, rendreVolet])
  // Territoire choisi dans les encarts : dans le volet, ils se referment et le volet remonte avec sa fiche.
  const choisirEncart = useCallback((s: Selection) => {
    actions.territoire(s)
    if (!enVolet()) return
    replierEncarts(true)
    replierPanneau(false)
    setDeplie(true)
  }, [actions, replierEncarts, replierPanneau])

  const changerMode = useCallback((mode: Mode) => modifierUrl({ mode: mode === 'tete' ? null : mode }), [modifierUrl])

  // Titre de l'onglet : ce que montre la page, pour l'historique du navigateur, les favoris et les liens partagés.
  useEffect(() => {
    const morceaux = vue.page === 'methodologie'
      ? ['Méthodologie']
      : [selection && titreDe(selection, index), scrutin?.libelle, vue.mode === 'tete' ? undefined : LIBELLE_MODE[vue.mode]]
    document.title = [...morceaux, 'Atlas électoral'].filter(Boolean).join(' · ')
  }, [vue.page, vue.mode, selection, scrutin, index])

  const ctx: Contexte | null = scrutin && agregats.data && candidats.data
    ? {
      scrutin, scrutins, agregats: agregats.data, candidats: candidats.data, parCand, agregatsVoix: agregatsVoix.data, index,
      repli: repliCarte, sourcesLocales,
    }
    : null

  const detail = useMemo(() => {
    const liste = agregats.data
    const voixAgregees = agregatsVoix.data
    if (!selection || !liste) return null
    const trouver = (niveau: Agregat['niveau'], code: string) => liste.find((a) => a.niveau === niveau && a.code === code)
    const voixDe = (niveau: Agregat['niveau'], code: string) =>
      voixAgregees?.filter((v) => v.niveau === niveau && v.code === code)
    const parent = (niveau: Agregat['niveau'], code: string, nom: string): Parent | undefined => {
      const a = trouver(niveau, code)
      const v = voixDe(niveau, code)
      return a && v ? { nom, exprimes: exprimesPourParts(a), voix: new Map(v.map((l) => [l.cand, l.voix])) } : undefined
    }
    // Commune au panachage : ses candidats viennent du fichier du département (undefined au chargement).
    const panachees = auPanachage ? panachage.data?.filter((l) => l.commune === communeChoisie) : undefined
    const supplementaires = panachees && new Map(panachees.map((l) => [l.cand, candidatureDuPanachage(l)]))
    const nom = (code: string) => index.noms.get(code) ?? code
    const portee = scrutin?.portee
    // Circonscriptions des candidatures présentes : une pour un bureau, parfois plusieurs pour une grande ville.
    const circonscriptionsDe = (lignes: readonly { cand: number }[] | undefined) =>
      [...new Set((lignes ?? []).map((l) => parCand.get(l.cand)?.circonscription).filter((c): c is string => !!c))].sort()
    // Le niveau de comparaison n'a de sens que si les mêmes candidatures s'y présentent : la commune
    // pour un bureau (la circonscription aux législatives), le département pour une commune à un
    // scrutin national, la France pour un département (par bloc hors scrutin national).
    // Une commune qui s'étend sur plusieurs cantons ou circonscriptions, ou Paris, Lyon et Marseille votant par
    // secteur, ont d'autres candidatures que leurs bureaux et arrondissements : pas de comparaison alors.
    const memesCandidatures = (lignes: readonly { cand: number }[] | undefined, p: Parent | undefined) => {
      if (!lignes || !p) return p
      const ici = new Set(lignes.map((l) => l.cand))
      return [...p.voix.keys()].every((cand) => ici.has(cand)) ? p : undefined
    }
    if (selection.niveau === 'bureau') {
      const lignes = panachees
        ? voixDuPanachage(panachees.filter((l) => l.code_bv === selection.code))
        : auPanachage ? undefined : voix.data?.filter((v) => v.code_bv === selection.code)
      const circos = circonscriptionsDe(lignes)
      const commune = communeDu(selection.code, index.passage)
      const agregatCommune = trouver('commune', commune)
      // Paris, Lyon et Marseille : un bureau se compare à son arrondissement (même secteur aux municipales).
      const arrondissement = arrondissementDu(selection.code)
      return {
        resultat: bureaux.data?.find((b) => b.code_bv === selection.code),
        lignes,
        circonscriptions: circos,
        supplementaires,
        parent: portee === 'circonscription'
          ? (circos.length === 1 ? parent('circonscription', circos[0], nom(circos[0])) : undefined)
          : panachees && agregatCommune
            ? { nom: nom(commune), exprimes: agregatCommune.exprimes, voix: new Map(voixDuPanachage(panachees).map((l) => [l.cand, l.voix])) }
            : memesCandidatures(lignes, arrondissement ? parent('arrondissement', arrondissement, nom(arrondissement)) : parent('commune', commune, nom(commune))),
        // Bureaux demandés à part : « pas de résultat » n'est dit qu'une fois leur fichier arrivé.
        enChargement: bureaux.data === undefined && !bureaux.error,
      }
    }
    if (selection.niveau === 'commune') {
      const lignes = auPanachage ? panachees && voixDuPanachage(panachees) : voixDe('commune', selection.code)
      const circos = circonscriptionsDe(lignes)
      const departement = index.territoires.get(selection.code)?.departement ?? selection.code.slice(0, 2)
      let comparaison: Parent | undefined
      if (portee === 'national') comparaison = parent('departement', departement, nom(departement))
      else if (portee === 'circonscription' && circos.length === 1) comparaison = parent('circonscription', circos[0], nom(circos[0]))
      return { resultat: trouver('commune', selection.code), lignes, circonscriptions: circos, supplementaires, parent: comparaison }
    }
    if (selection.niveau === 'arrondissement') {
      const lignes = voixDe('arrondissement', selection.code)
      const circos = circonscriptionsDe(lignes)
      const ville = villeDe(selection.code)
      // Comparaison avec la ville quand les mêmes candidatures s'y présentent (pas aux municipales par secteur,
      // ni aux cantonales ou aux législatives d'avant 2012, où chaque arrondissement a les siennes).
      let comparaison: Parent | undefined
      if (portee === 'circonscription') comparaison = circos.length === 1 ? parent('circonscription', circos[0], nom(circos[0])) : undefined
      else comparaison = memesCandidatures(lignes, parent('commune', ville, nom(ville)))
      // Municipales par secteur : un arrondissement se compare à son secteur, quand celui-ci en réunit plusieurs (c'est
      // là que se jouait l'élection).
      const secteur = scrutin && voteParSecteur(scrutin, ville) ? secteurDe(selection.code, Number(scrutin.date.slice(0, 4))) : undefined
      if (secteur) {
        const membres = secteur.arrondissements.map((code) => parent('arrondissement', code, nom(code)))
        if (membres.every((m) => m !== undefined)) {
          const voix = new Map<number, number>()
          for (const m of membres) for (const [cand, v] of m.voix) voix.set(cand, (voix.get(cand) ?? 0) + v)
          comparaison = {
            nom: secteur.nom, exprimes: membres.reduce((s, m) => s + m.exprimes, 0), voix,
            secteur: lesArrondissements(secteur.arrondissements),
          }
        }
      }
      return { resultat: trouver('arrondissement', selection.code), lignes, circonscriptions: circos, parent: comparaison }
    }
    if (selection.niveau === 'circonscription') {
      return { resultat: trouver('circonscription', selection.code), lignes: voixDe('circonscription', selection.code), circonscriptions: [], parent: undefined }
    }
    return {
      resultat: trouver('departement', selection.code),
      lignes: voixDe('departement', selection.code),
      circonscriptions: [],
      parent: parent('france', 'FR', 'France'),
    }
  }, [selection, scrutin, agregats.data, agregatsVoix.data, bureaux.data, bureaux.error, voix.data, index, parCand, auPanachage, communeChoisie, panachage.data])

  const complement = useMemo(() => {
    if (!selection || !detail?.lignes || !detail.resultat || detail.resultat.exprimes === 0) return undefined
    if (vue.mode === 'score' && cible) {
      if (auPanachage) return `${cible.libelle} : pas de part calculée, on vote ici pour des personnes.`
      const retenues = detail.lignes.filter((l) => cible.retenue(l.cand))
      if (retenues.length === 0) return `${cible.libelle} : aucune candidature ici.`
      return `${cible.libelle} : ${formatPart(retenues.reduce((s, l) => s + l.voix, 0) / exprimesPourParts(detail.resultat))} des suffrages exprimés.`
    }
    if (vue.mode === 'evolution' && !scrutinDe) return SANS_DEPART
    if (vue.mode === 'evolution' && evolution && scrutinDe) {
      // Les numéros de bureaux changent d'un scrutin à l'autre : un bureau se lit à sa commune, ou à son
      // arrondissement à Paris, Lyon et Marseille.
      const arrondissement = selection.niveau === 'bureau' ? arrondissementDu(selection.code) : undefined
      const niveau: Agregat['niveau'] = selection.niveau === 'bureau' ? (arrondissement ? 'arrondissement' : 'commune') : selection.niveau
      const code = selection.niveau === 'bureau' ? arrondissement ?? communeDu(selection.code, index.passage) : selection.code
      const avant = partDe(evolution.avant.agregats, evolution.avant.agregatsVoix, niveau, code, evolution.avant.retenue)
      const apres = partDe(evolution.apres.agregats, evolution.apres.agregatsVoix, niveau, code, evolution.apres.retenue)
      const ou = selection.niveau === 'bureau'
        ? ` (${arrondissement ? "à l'arrondissement" : 'à la commune'}, ${index.noms.get(code) ?? code})` : ''
      if (avant == null || apres == null) return `${LIBELLE_BLOC[bloc]}${ou} : non comparable entre les deux scrutins.`
      return `${LIBELLE_BLOC[bloc]}${ou} : ${formatPart(avant)} (${scrutinDe.libelle}), ${formatPart(apres)} (${scrutin?.libelle}), soit ${formatEcart(100 * (apres - avant))} ${unitePoints(100 * (apres - avant))}.`
    }
    return undefined
  }, [selection, detail, vue.mode, cible, evolution, scrutinDe, scrutin, bloc, index, auPanachage])

  const chargement = catalogue.isPending || agregats.isPending || candidats.isPending
    || (selection ? territoires.isPending : territoires.isPending && departements.isPending)
  const erreur = catalogue.error ?? agregats.error ?? candidats.error ?? bureaux.error ?? agregatsVoix.error ?? voix.error ?? panachage.error
    ?? contours.error ?? territoires.error ?? departements.error ?? agregatsDe.error ?? agregatsVoixDe.error ?? candidatsDe.error

  return (
    <div className="atlas" data-panneau-replie={voletReplie}>
      <aside id="panneau" className="panneau" data-deplie={deplie} data-replie={voletReplie}>
        <button
          type="button" className="poignee" aria-expanded={!voletReplie && deplie} aria-controls="panneau-corps"
          onClick={() => (voletReplie ? replierPanneau(false) : setDeplie(!deplie))}
        >
          <span className="visuellement-cache">{voletReplie ? 'Rouvrir le volet' : deplie ? 'Réduire le volet' : 'Agrandir le volet'}</span>
        </button>
        <header className="panneau-entete">
          <span className="marque">Atlas électoral</span>
          <a href={lienMethodologie} aria-current={vue.page === 'methodologie' ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); modifierUrl({ page: 'methodologie' }); setDeplie(true) }}>Méthodologie</a>
          {/* Téléphone : le volet descend jusqu'à une fine barre, pour voir toute la carte. */}
          <button type="button" className="replier-volet" aria-expanded={!voletReplie} aria-controls="panneau-corps"
            onClick={() => replierPanneau(!voletReplie)}>
            <span className="visuellement-cache">{voletReplie ? 'Rouvrir le volet' : 'Replier le volet'}</span>
            <Chevron ouvert={!voletReplie} />
          </button>
        </header>
        <Recherche entrees={entreesRecherche} postaux={postaux} onActiver={activerRecherche} onChoisir={allerA} onChoisirAdresse={choisirAdresse} />
        <div id="panneau-corps" className="panneau-corps">
          {erreur && (
            <div className="alerte" role="alert">
              <p>
                Les résultats n'ont pas pu être chargés : la connexion a peut-être été interrompue. Rechargez la page ;
                si le problème persiste, réessayez plus tard.
              </p>
              <button type="button" className="lien" onClick={() => window.location.reload()}>Recharger la page</button>
              <p className="detail-erreur">Détail : {erreur.message}</p>
            </div>
          )}
          {/* Fil d'Ariane et réglages hors du chargement des résultats : changer de scrutin ne les démonte pas. */}
          {vue.page !== 'methodologie' && selection && <EnteteFiche index={index} selection={selection} actions={actions} />}
          {vue.page !== 'methodologie' && scrutin && (
            <Reglages scrutin={scrutin} scrutins={scrutins} mode={vue.mode} cibles={cibles} cible={cible} bloc={bloc} de={scrutinDe} actions={actions} />
          )}
          {chargement && !erreur && <p className="note">Chargement des résultats…</p>}
          {vue.page === 'methodologie' && catalogue.data && scrutin && (
            <Methodologie
              catalogue={catalogue.data} scrutin={scrutin} noms={index.noms} onScrutin={actions.scrutin}
              onRetour={() => modifierUrl({ page: null })}
            />
          )}
          {vue.page !== 'methodologie' && ctx && (selection
            ? <Detail ctx={ctx} selection={selection} resultat={detail?.resultat} enChargement={detail !== null && 'enChargement' in detail && detail.enChargement}
                lignes={detail?.lignes} parent={detail?.parent}
                circonscriptions={detail?.circonscriptions ?? []} supplementaires={detail?.supplementaires} panachage={auPanachage}
                cible={vue.mode === 'score' ? cible : undefined} complement={complement} adresse={noteAdresse} actions={actions} />
            : <Apercu ctx={ctx} mode={vue.mode} cible={cible} bloc={bloc} evolution={apercuEvolution} actions={actions} />)}
          {vue.page !== 'methodologie' && ctx && !selection && (
            <nav className="raccourcis" aria-label="Outre-mer et Français de l'étranger">
              <h2 className="surtitre">Outre-mer et Français de l'étranger</h2>
              <ul>
                {HORS_METROPOLE.filter((code) => index.noms.has(code)).map((code) => (
                  <li key={code}>
                    <button type="button" className="lien" onClick={() => actions.territoire({ niveau: 'departement', code })}>
                      {index.noms.get(code)}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {vue.page !== 'methodologie' && ctx && (
            <Chronologie
              lignes={lignesSerie} erreur={serie.isError} scrutins={scrutins} courant={ctx.scrutin} niveau={niveauSerie}
              precision={selection?.niveau === 'bureau' ? (arrondissementDuBureau ? "à l'arrondissement" : 'à la commune') : undefined}
              fusion={niveauSerie === 'commune' && index.fusionnees.has(codeSerie)}
            />
          )}
          {!chargement && <p className="sources">
            Résultats : ministère de l'Intérieur, via data.gouv.fr. Contours des bureaux : data.gouv.fr (répertoire
            électoral de 2022, indicatifs). Limites administratives : IGN, simplifiées par Etalab (communes au 1er janvier
            2026). Blocs : circulaire du ministère de l'Intérieur de février 2026, appliquée à tous les scrutins.
          </p>}
        </div>
      </aside>
      <main className="zone-carte">
        {/* Ordinateur : languette au bord du panneau, qui le replie (la carte prend toute la largeur) ou le rouvre. */}
        <button type="button" className="languette" aria-expanded={!voletReplie} aria-controls="panneau"
          title={voletReplie ? 'Déplier le panneau' : 'Replier le panneau'} onClick={() => replierPanneau(!voletReplie)}>
          <span className="visuellement-cache">{voletReplie ? 'Déplier le panneau des résultats' : 'Replier le panneau des résultats'}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d={voletReplie ? 'M4.5 2.5 8 6l-3.5 3.5' : 'M7.5 2.5 4 6l3.5 3.5'} fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <ZoneCarte
          lancee={carteLancee}
          onPrete={signalerCarte}
          coloriage={etatCarte?.coloriage ?? null}
          contours={contours.data ?? AUCUN_CONTOUR}
          auBureau={carteAuBureau}
          repli={repliCarte}
          correctifs={correctifs.data ?? null}
          emprisesDepartements={emprisesDepartements}
          circonscriptions={scrutin?.portee === 'circonscription'}
          selection={selection}
          contour={contourCommune.data}
          contourIndisponible={contourCommune.isError}
          cadrage={cadrage ?? cadrageInitial}
          libelle={`Carte : ${etatCarte?.legende?.type === 'classes' ? etatCarte.legende.titre
            : vue.mode === 'tete' ? 'bloc en tête' : LIBELLE_MODE[vue.mode]}, ${scrutin?.libelle ?? ''}`}
          contenu={contenuInfobulle}
          onClic={choisirSurCarte}
          encarts={encarts.data}
          onChoisirEncart={choisirEncart}
          encartsReplies={encartsReplies}
          onBoutonEncarts={boutonEncarts}
          onCadrer={cadrer}
          repere={repere}
          visite={visite}
          onBureauAdresse={trouverBureau}
          legendeRepliee={legendeRepliee}
          voletReplie={voletReplie}
        />
        <Onglets mode={vue.mode} onMode={changerMode} />
        {etatCarte?.legende && (
          <Legende description={etatCarte.legende} note={noteContours} className="legende-carte" replie={legendeRepliee} onBasculer={basculerLegende} />
        )}
      </main>
    </div>
  )
}
