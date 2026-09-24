import type { Feature } from 'geojson'
import { useCallback, useMemo, useState } from 'react'
import { Carte, type Cadrage, type Survol } from './carte/Carte'
import {
  LIBELLE_BLOC, PALETTE_EVOLUTION, RAMPE_PARTICIPATION, RAMPE_SCORE, SEUILS_EVOLUTION, palier, type BlocColore,
} from './carte/couleurs'
import { Infobulle } from './carte/Infobulle'
import { Legende, type DescriptionLegende } from './carte/Legende'
import { Onglets } from './carte/Onglets'
import { blocEnTete, optionsCibles, retenueDuBloc } from './cibles'
import { nomCandidature } from './donnees/libelles'
import {
  useAgregats, useAgregatsVoix, useBureaux, useCandidats, useCatalogue, useContourCommune, useContours, useTerritoires, useVoix,
} from './donnees/requetes'
import { communeDu, departementDe, emprise, indexer, titreDe } from './donnees/territoires'
import type { Agregat, BureauContour, Resultat, ScrutinCatalogue, Territoire } from './donnees/types'
import { formatEcart, formatPart, formatPourcent } from './format'
import {
  LIBELLES_EVOLUTION, classesLegende, coloriageClasses, coloriageTete, couleursPour, ecartsAuNiveau, partDe,
  partsAuNiveau, seuilsDe, valeursEvolution, valeursParticipation, valeursScore, type Coloriage, type Mode, type Valeurs,
} from './modes'
import { Apercu, type ApercuEvolution } from './panneau/Apercu'
import type { Actions, Contexte } from './panneau/contexte'
import { Detail, type Parent } from './panneau/Detail'
import { preparer } from './recherche/chercher'
import { Recherche } from './recherche/Recherche'
import { useUrl } from './url'
import { ecrireSelection, lireVue, type Selection } from './vue'

const METHODOLOGIE = 'https://github.com/aurelien032-glitch/atlas-electoral/blob/main/docs/PLAN.md'
const FRANCE_METROPOLITAINE: [number, number, number, number] = [-5.2, 41.3, 9.6, 51.1]

/** Scrutin de départ par défaut du mode Évolution : le précédent dans le catalogue (ou le suivant). */
function scrutinVoisin(scrutins: ScrutinCatalogue[], courant: ScrutinCatalogue) {
  const i = scrutins.findIndex((s) => s.id === courant.id)
  return scrutins[i - 1] ?? scrutins[i + 1]
}

interface EtatCarte {
  coloriage: Coloriage
  legende: DescriptionLegende
  valeurs: Valeurs | null
}

interface PropsZone {
  coloriage: Coloriage | null
  contours: BureauContour[]
  auBureau: boolean
  selection: Selection | undefined
  contour: Feature | undefined
  cadrage: Cadrage | null
  libelle: string
  contenu: (survol: Survol) => { titre: string; lignes: string[] }
  onClic: (survol: Survol) => void
}

// Le survol change à chaque mouvement de souris : son état vit ici, pour ne pas recalculer les panneaux.
function ZoneCarte({ contenu, ...props }: PropsZone) {
  const [survol, setSurvol] = useState<Survol | null>(null)
  const bulle = survol && contenu(survol)
  return (
    <div className="zone-carte-fond">
      <Carte {...props} onSurvol={setSurvol} />
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
  const scrutin = scrutins.find((s) => s.id === vue.scrutin) ?? scrutins[0]
  const id = scrutin?.id
  const auBureau = scrutin?.jointure_contours?.niveau_carte === 'bureau'
  // L'évolution se lit à la commune : les numéros de bureaux changent d'un scrutin à l'autre.
  const carteAuBureau = auBureau && vue.mode !== 'evolution'
  const selection = vue.selection

  const agregats = useAgregats(id)
  const candidats = useCandidats(id)
  const bureaux = useBureaux(auBureau || selection?.niveau === 'bureau' ? id : undefined)
  const agregatsVoix = useAgregatsVoix(vue.mode === 'score' || vue.mode === 'evolution' || selection ? id : undefined)
  const voix = useVoix((vue.mode === 'score' && carteAuBureau) || selection?.niveau === 'bureau' ? id : undefined)
  const contours = useContours()
  const territoires = useTerritoires()
  const contourCommune = useContourCommune(selection?.niveau === 'commune' ? selection.code : undefined)

  const scrutinDe = vue.mode === 'evolution' && scrutin
    ? scrutins.find((s) => s.id === vue.de && s.id !== scrutin.id) ?? scrutinVoisin(scrutins, scrutin)
    : undefined
  const agregatsDe = useAgregats(scrutinDe?.id)
  const candidatsDe = useCandidats(scrutinDe?.id)
  const agregatsVoixDe = useAgregatsVoix(scrutinDe?.id)

  const parCand = useMemo(() => new Map((candidats.data ?? []).map((c) => [c.cand, c])), [candidats.data])
  const index = useMemo(() => indexer(territoires.data ?? []), [territoires.data])
  const cibles = useMemo(() => optionsCibles(scrutin, candidats.data), [scrutin, candidats.data])
  // Recherche : à pertinence égale, les communes qui comptent le plus d'inscrits passent devant.
  const entreesRecherche = useMemo(() => {
    const inscrits = new Map((agregats.data ?? []).filter((a) => a.niveau === 'commune').map((a) => [a.code, a.inscrits]))
    return preparer(territoires.data ?? [], inscrits)
  }, [territoires.data, agregats.data])
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
    const listeBureaux = carteAuBureau ? bureaux.data : null
    if (listeBureaux === undefined) return null
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
        const valeurs = valeursEvolution(evolution.avant, evolution.apres)
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
  }), [bureaux.data, agregats.data])

  const contenuInfobulle = useCallback((survol: Survol) => {
    const titre = titreDe({ niveau: survol.niveau, code: survol.code }, index.noms)
    const lignes: string[] = []
    if (vue.mode === 'tete') {
      const r = resultats[survol.niveau === 'bureau' ? 'bureaux' : 'communes'].get(survol.code)
      const tete = r?.tete != null ? parCand.get(r.tete) : undefined
      if (!r || r.exprimes === 0 || !tete) lignes.push('Aucun résultat rattaché')
      else if (r.egalite) lignes.push('Égalité en tête')
      else {
        const avance = r.avance_x10000 ?? 0
        lignes.push(`En tête : ${nomCandidature(tete)}`, `${LIBELLE_BLOC[tete.bloc]} · avance ${palier(avance).libelle}, ${formatEcart(avance / 100).replace('+', '')} pts`)
      }
    } else if (etatCarte?.valeurs) {
      const v = survol.niveau === 'bureau' ? etatCarte.valeurs.bureaux?.get(survol.code) : etatCarte.valeurs.communes.get(survol.code)
      if (v === undefined) lignes.push('Aucun résultat rattaché')
      else if (v === null) lignes.push(vue.mode === 'evolution' ? 'Non comparable' : 'Aucune candidature du bloc')
      else lignes.push(vue.mode === 'evolution' ? `${formatEcart(v)} points` : formatPourcent(v))
    }
    return { titre, lignes }
  }, [vue.mode, resultats, parCand, etatCarte, index])

  const actions: Actions = useMemo(() => ({
    scrutin: (valeur) => modifierUrl({ scrutin: valeur, cible: null }),
    cible: (valeur) => modifierUrl({ cible: valeur }),
    bloc: (valeur) => modifierUrl({ bloc: valeur }),
    de: (valeur) => modifierUrl({ de: valeur }),
    territoire: (s) => {
      modifierUrl({ sel: ecrireSelection(s) })
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
    const zone = emprise(index.territoires.get(s.niveau === 'bureau' ? communeDu(s.code) : s.code))
    return zone && { emprise: zone, jeton: 0 }
  }, [selectionInitiale, index])

  const choisirSurCarte = useCallback((survol: Survol) => {
    modifierUrl({ sel: ecrireSelection({ niveau: survol.niveau, code: survol.code }) })
    setDeplie(true)
  }, [modifierUrl])

  const allerA = useCallback((t: Territoire) => {
    actions.territoire({ niveau: t.niveau, code: t.code })
    setDeplie(true)
  }, [actions])

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
      return a && v ? { nom, exprimes: a.exprimes, voix: new Map(v.map((l) => [l.cand, l.voix])) } : undefined
    }
    const nom = (code: string) => index.noms.get(code) ?? code
    if (selection.niveau === 'bureau') {
      const commune = communeDu(selection.code)
      return {
        resultat: bureaux.data?.find((b) => b.code_bv === selection.code),
        lignes: voix.data?.filter((v) => v.code_bv === selection.code),
        parent: parent('commune', commune, nom(commune)),
      }
    }
    if (selection.niveau === 'commune') {
      // Une candidature locale (circonscription, commune) n'a pas de score départemental comparable.
      const departement = departementDe(selection.code)
      const comparable = scrutin?.portee === 'national'
      return {
        resultat: trouver('commune', selection.code),
        lignes: voixDe('commune', selection.code),
        parent: comparable ? parent('departement', departement, nom(departement)) : undefined,
      }
    }
    return { resultat: trouver('departement', selection.code), lignes: voixDe('departement', selection.code), parent: parent('france', 'FR', 'France') }
  }, [selection, scrutin, agregats.data, agregatsVoix.data, bureaux.data, voix.data, index])

  const complement = useMemo(() => {
    if (!selection || !detail?.lignes || !detail.resultat || detail.resultat.exprimes === 0) return undefined
    if (vue.mode === 'score' && cible) {
      const retenues = detail.lignes.filter((l) => cible.retenue(l.cand))
      if (retenues.length === 0) return `${cible.libelle} : aucune candidature ici.`
      return `${cible.libelle} : ${formatPart(retenues.reduce((s, l) => s + l.voix, 0) / detail.resultat.exprimes)} des suffrages exprimés.`
    }
    if (vue.mode === 'evolution' && evolution && scrutinDe) {
      const niveau: Agregat['niveau'] = selection.niveau === 'departement' ? 'departement' : 'commune'
      const code = selection.niveau === 'bureau' ? communeDu(selection.code) : selection.code
      const avant = partDe(evolution.avant.agregats, evolution.avant.agregatsVoix, niveau, code, evolution.avant.retenue)
      const apres = partDe(evolution.apres.agregats, evolution.apres.agregatsVoix, niveau, code, evolution.apres.retenue)
      const ou = selection.niveau === 'bureau' ? ` (à la commune, ${index.noms.get(code) ?? code})` : ''
      if (avant == null || apres == null) return `${LIBELLE_BLOC[bloc]}${ou} : non comparable entre les deux scrutins.`
      return `${LIBELLE_BLOC[bloc]}${ou} : ${formatPart(avant)} (${scrutinDe.libelle}), ${formatPart(apres)} (${scrutin?.libelle}), soit ${formatEcart(100 * (apres - avant))} points.`
    }
    return undefined
  }, [selection, detail, vue.mode, cible, evolution, scrutinDe, scrutin, bloc, index])

  const chargement = catalogue.isPending || agregats.isPending || candidats.isPending || territoires.isPending
  const erreur = catalogue.error ?? agregats.error ?? candidats.error ?? bureaux.error ?? agregatsVoix.error ?? voix.error
    ?? contours.error ?? territoires.error ?? agregatsDe.error ?? agregatsVoixDe.error ?? candidatsDe.error

  return (
    <div className="atlas">
      <aside className="panneau" data-deplie={deplie}>
        <button type="button" className="poignee" aria-expanded={deplie} aria-controls="panneau-corps" onClick={() => setDeplie(!deplie)}>
          <span className="visuellement-cache">{deplie ? 'Réduire le panneau' : 'Déplier le panneau'}</span>
        </button>
        <header className="panneau-entete">
          <span className="marque">Atlas électoral</span>
          <a href={METHODOLOGIE}>Méthodologie</a>
        </header>
        <Recherche entrees={entreesRecherche} onChoisir={allerA} />
        <div id="panneau-corps" className="panneau-corps">
          {erreur && <p className="alerte">Données indisponibles : {erreur.message}</p>}
          {chargement && !erreur && <p className="note">Chargement…</p>}
          {ctx && (selection
            ? <Detail ctx={ctx} selection={selection} resultat={detail?.resultat} lignes={detail?.lignes} parent={detail?.parent}
                cible={vue.mode === 'score' ? cible : undefined} complement={complement} actions={actions} />
            : <Apercu ctx={ctx} mode={vue.mode} cibles={cibles} cible={cible} bloc={bloc} evolution={apercuEvolution} actions={actions} />)}
          {etatCarte && <Legende description={etatCarte.legende} className="legende-panneau" />}
          <p className="sources">
            Résultats : ministère de l'Intérieur, via data.gouv.fr. Contours des bureaux : data.gouv.fr (REU 2022,
            indicatifs). Limites administratives : IGN, simplifiées par Etalab (COG 2026). Blocs : circulaire du ministère
            de l'Intérieur de février 2026, appliquée à tous les scrutins.
          </p>
        </div>
      </aside>
      <main className="zone-carte">
        <ZoneCarte
          coloriage={etatCarte?.coloriage ?? null}
          contours={contours.data ?? []}
          auBureau={carteAuBureau}
          selection={selection}
          contour={contourCommune.data}
          cadrage={cadrage ?? cadrageInitial}
          libelle={`Carte : ${etatCarte?.legende.type === 'classes' ? etatCarte.legende.titre : 'bloc en tête'}, ${scrutin?.libelle ?? ''}`}
          contenu={contenuInfobulle}
          onClic={choisirSurCarte}
        />
        <Onglets mode={vue.mode} onMode={changerMode} />
        {etatCarte && <Legende description={etatCarte.legende} className="legende-carte" />}
      </main>
    </div>
  )
}
