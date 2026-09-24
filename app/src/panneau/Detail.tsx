import { LIBELLE_BLOC, palier } from '../carte/couleurs'
import type { Cible } from '../cibles'
import { nomCandidature } from '../donnees/libelles'
import { communeDu, departementDe, departementDeCirconscription, numeroDu, titreDe } from '../donnees/territoires'
import { exprimesPourParts, type Bloc, type Candidature, type Resultat } from '../donnees/types'
import { formatNombre, formatPart, unitePoints } from '../format'
import type { Selection } from '../vue'
import { Barres, type LigneResultat } from './Barres'
import { couleurDuBloc, type Actions, type Contexte } from './contexte'

export interface Parent {
  nom: string
  exprimes: number
  voix: ReadonlyMap<number, number>
}

interface Props {
  ctx: Contexte
  selection: Selection
  resultat: Resultat | undefined
  /** Voix de chaque candidature présente dans le territoire (undefined pendant le chargement). */
  lignes: readonly { cand: number; voix: number }[] | undefined
  parent: Parent | undefined
  /** Législatives : circonscription(s) des candidatures du territoire. */
  circonscriptions: string[]
  /** Candidats d'une commune au panachage, absents des candidatures publiées (chargés à la demande). */
  supplementaires?: ReadonlyMap<number, Candidature>
  /** Commune au panachage : chaque électeur vote pour plusieurs candidats. */
  panachage?: boolean
  cible: Cible | undefined
  /** Valeur du territoire dans le mode courant (score, évolution…), déjà rédigée. */
  complement: string | undefined
  actions: Actions
}

function FilAriane({ ctx, selection, actions }: Pick<Props, 'ctx' | 'selection' | 'actions'>) {
  const nom = (code: string) => ctx.index.noms.get(code) ?? code
  const commune = selection.niveau === 'bureau' ? communeDu(selection.code, ctx.index.passage) : selection.code
  const departement = selection.niveau === 'departement'
    ? selection.code
    : selection.niveau === 'circonscription'
      ? departementDeCirconscription(selection.code)
      : ctx.index.territoires.get(commune)?.departement ?? departementDe(commune)
  const etapes: { libelle: string; selection: Selection | undefined }[] = [
    { libelle: 'France', selection: undefined },
    { libelle: nom(departement), selection: { niveau: 'departement', code: departement } },
  ]
  if (selection.niveau === 'circonscription') {
    etapes.push({ libelle: nom(selection.code).split(', ').pop() ?? selection.code, selection })
  } else if (selection.niveau !== 'departement') {
    etapes.push({ libelle: nom(commune), selection: { niveau: 'commune', code: commune } })
  }
  if (selection.niveau === 'bureau') etapes.push({ libelle: `Bureau ${numeroDu(selection.code)}`, selection })
  return (
    <nav aria-label="Fil d'Ariane" className="ariane">
      <ol>
        {etapes.map((e, i) => (
          <li key={e.libelle + i}>
            {i === etapes.length - 1
              ? <span aria-current="page">{e.libelle}</span>
              : <button type="button" className="lien" onClick={() => actions.territoire(e.selection)}>{e.libelle}</button>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Detail({ ctx, selection, resultat, lignes, parent, circonscriptions, supplementaires, panachage, cible, complement, actions }: Props) {
  const titre = titreDe(selection, ctx.index)
  const entete = (
    <>
      <div className="detail-haut">
        <FilAriane ctx={ctx} selection={selection} actions={actions} />
        <button type="button" className="fermer" aria-label="Fermer le détail et revenir à la France entière" onClick={() => actions.territoire(undefined)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="titre">
        <h1>{titre}</h1>
        <p className="surtitre-bas">{ctx.scrutin.libelle}</p>
        {circonscriptions.length > 0 && (
          <p className="circonscriptions">
            {circonscriptions.length === 1 ? 'Circonscription : ' : 'Circonscriptions : '}
            {circonscriptions.map((code, i) => (
              <span key={code}>
                {i > 0 && ' ; '}
                <button type="button" className="lien" onClick={() => actions.territoire({ niveau: 'circonscription', code })}>
                  {ctx.index.noms.get(code) ?? code}
                </button>
              </span>
            ))}
          </p>
        )}
      </div>
    </>
  )
  if (!resultat) return <>{entete}<p className="note">Aucun résultat rattaché à ce territoire pour ce scrutin.</p></>
  if (resultat.exprimes === 0) return <>{entete}<p className="note">Aucun suffrage exprimé.</p></>

  const candidature = (cand: number) => ctx.parCand.get(cand) ?? supplementaires?.get(cand)
  const nom = (cand: number) => {
    const c = candidature(cand)
    return c ? nomCandidature(c) : `candidature ${cand}`
  }
  // Au département (et au-delà), les législatives et les municipales comptent des dizaines de
  // candidatures locales : on les regroupe par bloc. Une circonscription garde ses candidatures.
  const parBloc = ctx.scrutin.portee !== 'national' && selection.niveau === 'departement'
  const tries = [...(lignes ?? [])].sort((a, b) => b.voix - a.voix)
  let phrase: string | undefined
  if (!parBloc && tries.length >= 2 && resultat.tete !== null) {
    const tete = resultat.tete
    const avance = (resultat.avance_x10000 ?? 0) / 100
    phrase = resultat.egalite
      ? `Égalité en tête entre ${nom(tries[0].cand)} et ${nom(tries[1].cand)}.`
      : `${nom(tete)} arrive en tête, ${avance.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unitePoints(avance)} devant ${nom(tries.find((l) => l.cand !== tete)?.cand ?? tries[1].cand)} : une avance ${palier(resultat.avance_x10000 ?? 0).libelle}.`
  }

  let rangees: LigneResultat[]
  const presentes: Candidature[] = []
  if (parBloc) {
    const somme = (paires: Iterable<[number, number]>) => {
      const m = new Map<Bloc, number>()
      for (const [cand, voix] of paires) {
        const bloc = ctx.parCand.get(cand)?.bloc ?? 'NC'
        m.set(bloc, (m.get(bloc) ?? 0) + voix)
      }
      return m
    }
    const ici = somme(tries.map((l) => [l.cand, l.voix]))
    const ailleurs = parent ? somme(parent.voix) : undefined
    rangees = [...ici].sort((a, b) => b[1] - a[1]).map(([bloc, voix]) => ({
      cle: bloc, nom: LIBELLE_BLOC[bloc], couleur: couleurDuBloc(bloc), part: voix / exprimesPourParts(resultat),
      partParent: ailleurs && parent ? (ailleurs.get(bloc) ?? 0) / parent.exprimes : undefined,
      marquee: cible?.bloc === bloc,
    }))
  } else {
    rangees = tries.map((l) => {
      const c = candidature(l.cand)
      if (c) presentes.push(c)
      const voixParent = parent?.voix.get(l.cand)
      return {
        cle: String(l.cand), nom: nom(l.cand), couleur: couleurDuBloc(c?.bloc ?? 'NC'), part: l.voix / resultat.exprimes,
        mention: c?.elu ? (c.sexe === 'F' ? 'élue' : 'élu') : undefined,
        partParent: parent && voixParent !== undefined ? voixParent / parent.exprimes : undefined,
        marquee: cible?.retenue(l.cand) ?? false,
      }
    })
  }
  const casLimites = presentes.filter((c) => c.cas_limite)
  const attribuees = presentes.some((c) => c.origine_nuance === 'attribuée')

  return (
    <>
      {entete}
      {phrase && <p className="chapo">{phrase}</p>}
      {complement && <p className="complement">{complement}</p>}
      <div className="chiffres trois">
        <div><strong>{formatNombre(resultat.inscrits)}</strong><span>inscrits</span></div>
        <div><strong>{formatPart(resultat.votants / resultat.inscrits)}</strong><span>de participation</span></div>
        <div><strong>{formatNombre(resultat.exprimes)}</strong><span>suffrages exprimés</span></div>
        <p className="chiffres-note">
          {formatNombre(resultat.votants)} votants, dont {resultat.blancs === null
            ? `${formatNombre(resultat.nuls)} bulletins blancs et nuls (comptés ensemble avant 2016)`
            : `${formatNombre(resultat.blancs)} bulletins blancs et ${formatNombre(resultat.nuls)} nuls`}
        </p>
      </div>
      {resultat.votants > resultat.inscrits && (
        <p className="alerte">Plus de votants que d'inscrits : anomalie présente dans les données officielles.</p>
      )}
      {lignes === undefined
        ? <p className="note">Chargement des voix…</p>
        : <Barres lignes={rangees} legende={`Résultats, ${titre}`} entete={parBloc ? 'Bloc' : 'Candidature'} parent={parent?.nom} />}
      {panachage && (
        <p className="note-bas">
          Petite commune : on y vote pour des personnes (panachage). Chaque électeur peut choisir plusieurs
          candidats : les pourcentages ne s'additionnent pas.
        </p>
      )}
      {parBloc && 'panachage' in resultat && resultat.panachage === true && (
        <p className="note-bas">
          Parts calculées sur les communes votant par listes : dans les petites communes, on vote pour des
          personnes (panachage).
        </p>
      )}
      <p className="note-bas">
        En % des suffrages exprimés.
        {selection.niveau === 'bureau' && ' Contours de bureaux indicatifs, reconstitués à partir du Répertoire électoral unique (2022).'}
        {attribuees && " Nuances attribuées par le projet quand le ministère n'en donne pas."}
        {casLimites.length > 0 && ` Classement signalé comme cas limite : ${casLimites.map((c) => `${nomCandidature(c)} (nuance ${c.nuance}, ${LIBELLE_BLOC[c.bloc].toLowerCase()})`).join(', ')}.`}
      </p>
    </>
  )
}
