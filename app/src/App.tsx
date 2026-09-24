import type { Feature } from 'geojson'
import { Component, Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Cadrage, Survol } from './carte/Carte'
import { Encarts } from './carte/Encarts'
import {
  LIBELLE_BLOC, PALETTE_EVOLUTION, RAMPE_PARTICIPATION, RAMPE_SCORE, SEUILS_EVOLUTION, palier, type BlocColore,
} from './carte/couleurs'
import { Infobulle } from './carte/Infobulle'
import { Legende, type DescriptionLegende } from './carte/Legende'
import { Onglets } from './carte/Onglets'
import { blocEnTete, optionsCibles, retenueDuBloc } from './cibles'
import { nomCandidature } from './donnees/libelles'
import {
  useAgregats, useAgregatsVoix, useBureaux, useCandidats, useCatalogue, useCirconscriptions, useContourCommune, useContours,
  useCodesPostaux, useDepartements, useEncarts, usePanachage, usePassage, useSeriesCommunes, useSeriesTerritoires,
  useTerritoires, useVoix,
} from './donnees/requetes'
import { arrondissementDu, communeDu, departementDe, emprise, indexer, titreDe, villeDe } from './donnees/territoires'
import { scrutinParDefaut, scrutinPrecedent, voteParSecteur } from './donnees/scrutins'
import {
  exprimesPourParts, type Agregat, type BureauContour, type Candidature, type Encart, type Resultat, type Territoire,
  type VoixPanachage,
} from './donnees/types'
import { formatEcart, formatPart, formatPourcent, unitePoints } from './format'
import {
  LIBELLES_EVOLUTION, classesLegende, coloriageClasses, coloriageTete, couleursPour, ecartsAuNiveau, partDe,
  partsAuNiveau, seuilsDe, valeursEvolution, valeursParticipation, valeursScore, type Coloriage, type Mode, type Valeurs,
} from './modes'
import { Apercu, type ApercuEvolution } from './panneau/Apercu'
import { Chronologie } from './panneau/Chronologie'
import type { Actions, Contexte } from './panneau/contexte'
import { Detail, type Parent } from './panneau/Detail'
import { Methodologie } from './panneau/Methodologie'
import { indexerCodesPostaux, preparer } from './recherche/chercher'
import { Recherche } from './recherche/Recherche'
import { useUrl } from './url'
import { ecrireSelection, lireVue, type Selection } from './vue'


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
const FRANCE_METROPOLITAINE: [number, number, number, number] = [-5.2, 41.3, 9.6, 51.1]

// MapLibre (270 Ko compressés) arrive après l'application : le panneau et ses chiffres s'affichent sans
// attendre que la carte soit prête.
const Carte = lazy(() => import('./carte/Carte').then((m) => ({ default: m.Carte })))
// Référence stable : un tableau vide recréé à chaque rendu relancerait tout le coloriage de la carte.
const AUCUN_CONTOUR: BureauContour[] = []
/** Territoires hors de la métropole, accessibles depuis l'aperçu : départements et collectivités d'outre-mer,
 * Français établis hors de France (« ZZ »). */
const HORS_METROPOLE = ['971', '972', '973', '974', '976', '975', '977', '978', '986', '987', '988', 'ZZ']

interface EtatCarte {
  coloriage: Coloriage
  legende: DescriptionLegende
  valeurs: Valeurs | null
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
  circonscriptions: boolean
  selection: Selection | undefined
  contour: Feature | undefined
  cadrage: Cadrage | null
  libelle: string
  contenu: (survol: Survol) => { titre: string; lignes: string[] }
  onClic: (survol: Survol) => void
  /** Vue nationale : encarts de la petite couronne et de l'outre-mer. */
  encarts: Encart[] | undefined
  onChoisirEncart: (selection: Selection) => void
  onCadrer: (emprise: [number, number, number, number]) => void
  /** Carte prête, ou en échec : ce qui attendait la carte peut se télécharger. */
  onPrete: () => void
}

// Le survol change à chaque mouvement de souris : son état vit ici, pour ne pas recalculer les panneaux.
function ZoneCarte({ lancee, contenu, encarts, onChoisirEncart, onCadrer, onPrete, ...props }: PropsZone) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const bulle = survol && contenu(survol)
  return (
    <div className="zone-carte-fond">
      {lancee && (
        <GardeCarte onEchec={onPrete}>
          <Suspense fallback={null}>
            <Carte {...props} onSurvol={setSurvol} onPrete={onPrete} />
          </Suspense>
        </GardeCarte>
      )}
      {encarts && !props.selection && (
        <Encarts
          encarts={encarts} coloriage={props.coloriage} onSurvol={setSurvol} onChoisir={onChoisirEncart} onCadrer={onCadrer}
          parCirconscription={props.circonscriptions && (props.coloriage?.circonscriptions?.size ?? 0) > 0}
        />
      )}
      {survol && bulle && <Infobulle x={survol.x} y={survol.y} largeur={survol.largeur} titre={bulle.titre} lignes={bulle.lignes} />}
    </div>
  )
}

export default function App() {
  const [parametres, modifierUrl] = useUrl()
  const vue = useMemo(() => lireVue(parametres), [parametres])
  const [cadrage, setCadrage] = useState<Cadrage | null>(null)
  const [deplie, setDeplie] = useState(false)

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
  // Correspondance bureau → commune : seulement pour les cartes à la commune.
  const contours = useContours(chiffresPrets && !carteAuBureau)
  const encarts = useEncarts(chiffresPrets)
  // Recherche, préparée à la première utilisation du champ (normaliser 35 000 noms prend du temps) : à
  // pertinence égale, les communes qui comptent le plus d'inscrits passent devant.
  const [rechercheActive, setRechercheActive] = useState(false)
  const activerRecherche = useCallback(() => setRechercheActive(true), [])
  // Index des territoires : les départements suffisent à la vue nationale ; les 35 000 communes (600 Ko)
  // viennent après la carte, sauf pour un lien vers un territoire, qui attend son nom, ou pour la recherche.
  const departements = useDepartements()
  const territoires = useTerritoires(carteChargee || selection !== undefined || rechercheActive)
  const communesNommees = territoires.data !== undefined
  const passage = usePassage()
  const circonscriptions = useCirconscriptions(scrutin?.portee === 'circonscription' ? id : undefined)
  const contourCommune = useContourCommune(selection?.niveau === 'commune' ? selection.code : undefined)

  const scrutinDe = vue.mode === 'evolution' && scrutin
    ? scrutins.find((s) => s.id === vue.de && s.id !== scrutin.id) ?? scrutinPrecedent(scrutins, scrutin)
    : undefined
  const agregatsDe = useAgregats(scrutinDe?.id)
  const candidatsDe = useCandidats(scrutinDe?.id)
  const agregatsVoixDe = useAgregatsVoix(scrutinDe?.id)

  const parCand = useMemo(() => new Map((candidats.data ?? []).map((c) => [c.cand, c])), [candidats.data])
  const index = useMemo(
    () => indexer(territoires.data ?? departements.data ?? [], passage.data, circonscriptions.data),
    [territoires.data, departements.data, passage.data, circonscriptions.data],
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
    const poids = (champ: 'exprimes' | 'inscrits') => listeBureaux
      ? new Map(listeBureaux.map((b) => [b.code_bv, b[champ]]))
      : new Map(communes.map((c) => [c.code, c[champ]]))
    switch (vue.mode) {
      case 'tete': {
        const blocDe = (cand: number) => parCand.get(cand)?.bloc ?? 'NC'
        const couverture = auBureau ? null : scrutin.jointure_contours?.taux_inscrits_metropole ?? null
        return { coloriage: coloriageTete(agregats.data, listeBureaux, blocDe), valeurs: null, legende: { type: 'tete', couvertureCommune: couverture } }
      }
      case 'participation': {
        const valeurs = valeursParticipation(agregats.data, listeBureaux)
        const fines = valeurs.bureaux ?? valeurs.communes
        const seuils = seuilsDe(fines, poids('inscrits'))
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
        const seuils = seuilsDe(fines, poids('exprimes'))
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
  }, [scrutin, agregats.data, candidats.data, bureaux.data, agregatsVoix.data, voix.data, carteAuBureau, auBureau, vue.mode, cible, evolution, bloc, parCand])

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
  }, [vue.mode, resultats, parCand, etatCarte, index, communesNommees, communesPanachage, scrutin, bureaux.data, bureaux.error])

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
  // seul le panneau recadre (un clic sur la carte montre un territoire déjà à l'écran).
  const [selectionInitiale] = useState(() => lireVue(new URLSearchParams(window.location.search)).selection)
  const cadrageInitial = useMemo((): Cadrage | null => {
    if (!selectionInitiale) return null
    const s = selectionInitiale
    const zone = emprise(index.territoires.get(s.niveau === 'bureau' ? communeDu(s.code, index.passage) : s.code))
    return zone && { emprise: zone, jeton: 0 }
  }, [selectionInitiale, index])

  const choisirSurCarte = useCallback((survol: Survol) => {
    modifierUrl({ sel: ecrireSelection({ niveau: survol.niveau, code: survol.code }), page: null })
    setDeplie(true)
  }, [modifierUrl])

  const allerA = useCallback((t: Territoire) => {
    actions.territoire({ niveau: t.niveau, code: t.code })
    setDeplie(true)
  }, [actions])

  const lienMethodologie = useMemo(() => {
    const p = new URLSearchParams(parametres)
    p.set('page', 'methodologie')
    return `?${p}`
  }, [parametres])

  const cadrer = useCallback((emprise: [number, number, number, number]) => setCadrage({ emprise, jeton: Date.now() }), [])

  const changerMode = useCallback((mode: Mode) => modifierUrl({ mode: mode === 'tete' ? null : mode }), [modifierUrl])

  const ctx: Contexte | null = scrutin && agregats.data && candidats.data
    ? { scrutin, scrutins, agregats: agregats.data, candidats: candidats.data, parCand, agregatsVoix: agregatsVoix.data, index }
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
    <div className="atlas">
      <aside className="panneau" data-deplie={deplie}>
        <button type="button" className="poignee" aria-expanded={deplie} aria-controls="panneau-corps" onClick={() => setDeplie(!deplie)}>
          <span className="visuellement-cache">{deplie ? 'Réduire le panneau' : 'Déplier le panneau'}</span>
        </button>
        <header className="panneau-entete">
          <span className="marque">Atlas électoral</span>
          <a href={lienMethodologie} aria-current={vue.page === 'methodologie' ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); modifierUrl({ page: 'methodologie' }); setDeplie(true) }}>Méthodologie</a>
        </header>
        <Recherche entrees={entreesRecherche} postaux={postaux} onActiver={activerRecherche} onChoisir={allerA} />
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
                cible={vue.mode === 'score' ? cible : undefined} complement={complement} actions={actions} />
            : <Apercu ctx={ctx} mode={vue.mode} cibles={cibles} cible={cible} bloc={bloc} evolution={apercuEvolution} actions={actions} />)}
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
          {vue.page !== 'methodologie' && etatCarte && <Legende description={etatCarte.legende} className="legende-panneau" />}
          {!chargement && <p className="sources">
            Résultats : ministère de l'Intérieur, via data.gouv.fr. Contours des bureaux : data.gouv.fr (répertoire
            électoral de 2022, indicatifs). Limites administratives : IGN, simplifiées par Etalab (communes au 1er janvier
            2026). Blocs : circulaire du ministère de l'Intérieur de février 2026, appliquée à tous les scrutins.
          </p>}
        </div>
      </aside>
      <main className="zone-carte">
        <ZoneCarte
          lancee={carteLancee}
          onPrete={signalerCarte}
          coloriage={etatCarte?.coloriage ?? null}
          contours={contours.data ?? AUCUN_CONTOUR}
          auBureau={carteAuBureau}
          circonscriptions={scrutin?.portee === 'circonscription'}
          selection={selection}
          contour={contourCommune.data}
          cadrage={cadrage ?? cadrageInitial}
          libelle={`Carte : ${etatCarte?.legende.type === 'classes' ? etatCarte.legende.titre : 'bloc en tête'}, ${scrutin?.libelle ?? ''}`}
          contenu={contenuInfobulle}
          onClic={choisirSurCarte}
          encarts={encarts.data}
          onChoisirEncart={actions.territoire}
          onCadrer={cadrer}
        />
        <Onglets mode={vue.mode} onMode={changerMode} />
        {etatCarte && <Legende description={etatCarte.legende} className="legende-carte" />}
      </main>
    </div>
  )
}
