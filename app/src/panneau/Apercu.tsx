import { useState, type ReactNode } from 'react'
import type { Mesure } from '../calculs/parts'
import { BLOCS_COLORES, DU_BLOC, LIBELLE_BLOC, type BlocColore } from '../carte/couleurs'
import type { Cible } from '../cibles'
import { nomCandidature, nuanceCourte } from '../donnees/libelles'
import { grouper, voteParSecteur } from '../donnees/scrutins'
import { exprimesPourParts, type Bloc, type ScrutinCatalogue } from '../donnees/types'
import { formatEcart, formatNombre, formatPart } from '../format'
import { partsAuNiveau, type Mode } from '../modes'
import { Barres, type LigneResultat } from './Barres'
import { TableNuances } from './Nuances'
import { couleurDuBloc, pluriel, type Actions, type Contexte } from './contexte'
import { Extremes } from './Extremes'
import { CouvertureNationale } from './Signalements'
import { compterTetes, enumerer, extremes } from './resume'

/** Mode Évolution : écarts déjà calculés (ils demandent les données des deux scrutins). */
export interface ApercuEvolution {
  de: ScrutinCatalogue
  france: [Mesure, Mesure]
  departements: Map<string, Mesure>
  communesSansObjet: number
}

interface Props {
  ctx: Contexte
  mode: Mode
  cibles: Cible[]
  cible: Cible | undefined
  bloc: BlocColore
  evolution: ApercuEvolution | undefined
  actions: Actions
}

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

function ChoixScrutin({ ctx, actions, libelle = 'Scrutin' }: { ctx: Contexte; actions: Actions; libelle?: string }) {
  return (
    <label className="champ">
      <span>{libelle}</span>
      <select value={ctx.scrutin.id} onChange={(e) => actions.scrutin(e.target.value)}>
        {grouper(ctx.scrutins).map((g) => (
          <optgroup key={g.code} label={g.libelle}>
            {g.scrutins.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function Titre({ surtitre, titre, children }: { surtitre?: string; titre: string; children?: ReactNode }) {
  return (
    <div className="titre">
      {surtitre && <p className="surtitre">{surtitre}</p>}
      <h1>{titre}</h1>
      {children && <p className="chapo">{children}</p>}
    </div>
  )
}

const choisirDepartement = (actions: Actions) => (code: string) => actions.territoire({ niveau: 'departement', code })

export function Apercu(props: Props) {
  const Contenu = {
    tete: ApercuTete, score: ApercuScore, participation: ApercuParticipation, evolution: ApercuEvolutionBloc,
  }[props.mode]
  // Ce que la source ne contient pas vaut pour tous les modes : signalé sous chacun.
  return <><Contenu {...props} /><CouvertureNationale ctx={props.ctx} /></>
}

function ApercuTete({ ctx, actions }: Props) {
  const [tout, setTout] = useState(false)
  const france = ctx.agregats.find((a) => a.niveau === 'france')
  if (!france) return null
  const national = ctx.scrutin.portee === 'national'
  const nom = (cand: number) => {
    const c = ctx.parCand.get(cand)
    return c ? nomCandidature(c) : `candidature ${cand}`
  }
  let phrase: string
  let lignes: LigneResultat[]
  if (national) {
    const tetes = compterTetes(ctx.agregats, 'departement', (cand) => cand, ctx.index.departements)
    phrase = tetes.length === 0 ? '' : `${enumerer(tetes.map(([cand, n], i) =>
      i === 0 ? `${nom(cand)} arrive en tête dans ${n} ${pluriel(n, 'département')}` : `${nom(cand)} dans ${n}`))}.`
    lignes = [...ctx.candidats].sort((a, b) => b.voix_total - a.voix_total).map((c) => ({
      cle: String(c.cand), nom: nomCandidature(c), couleur: couleurDuBloc(c.bloc), part: c.voix_total / france.exprimes,
      detail: nuanceCourte(c),
    }))
  } else {
    const blocDe = (cand: number): Bloc => ctx.parCand.get(cand)?.bloc ?? 'NC'
    const parCirconscription = ctx.scrutin.portee === 'circonscription'
    // Municipales jusqu'en 2020 : Paris, Lyon et Marseille votaient par secteur, aucune liste n'y est « en tête ».
    const agregats = ctx.agregats.filter((a) => a.niveau !== 'commune' || !voteParSecteur(ctx.scrutin, a.code))
    const tetes = compterTetes(agregats, parCirconscription ? 'circonscription' : 'commune', blocDe)
    phrase = `Bloc en tête, par ${parCirconscription ? 'circonscription' : 'commune'} : ${enumerer(tetes.map(([b, n]) => `${LIBELLE_BLOC[b].toLowerCase()} dans ${formatNombre(n)}`))}.`
    const elus = ctx.candidats.filter((c) => c.elu)
    if (elus.length > 0) {
      const parBloc = new Map<Bloc, number>()
      for (const c of elus) parBloc.set(c.bloc, (parBloc.get(c.bloc) ?? 0) + 1)
      const detail = [...parBloc].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${LIBELLE_BLOC[b].toLowerCase()} ${n}`)
      phrase += ` ${formatNombre(elus.length)} ${pluriel(elus.length, 'élu')} à ce tour : ${enumerer(detail)}.`
    }
    const sommes = new Map<Bloc, number>()
    for (const c of ctx.candidats) sommes.set(c.bloc, (sommes.get(c.bloc) ?? 0) + c.voix_total)
    lignes = [...sommes].sort((a, b) => b[1] - a[1]).map(([b, voix]) => ({
      cle: b, nom: LIBELLE_BLOC[b], couleur: couleurDuBloc(b), part: voix / exprimesPourParts(france),
    }))
  }
  const visibles = tout ? lignes : lignes.slice(0, 5)
  return (
    <>
      <ChoixScrutin ctx={ctx} actions={actions} />
      <Titre titre={ctx.scrutin.libelle}>{phrase}</Titre>
      <div className="chiffres">
        <div><strong>{formatPart(france.votants / france.inscrits)}</strong><span>de participation</span></div>
        <div><strong>{compact.format(france.inscrits)}</strong><span>d'inscrits</span></div>
      </div>
      <section>
        <h2 className="surtitre">{national ? 'France entière' : 'Blocs, France entière'}</h2>
        <Barres lignes={visibles} legende={`Résultats en France, ${ctx.scrutin.libelle}`} entete={national ? 'Candidature' : 'Bloc'} />
        {lignes.length > 5 && (
          <button type="button" className="lien" aria-expanded={tout} onClick={() => setTout(!tout)}>
            {tout ? 'Réduire la liste' : `Voir les ${lignes.length} ${national ? 'candidatures' : 'blocs'}`}
          </button>
        )}
        {france.panachage && (
          <p className="note-bas">
            Parts calculées sur les communes votant par listes. Dans les petites communes, on vote pour des personnes
            (panachage) : chaque électeur peut choisir plusieurs candidats, dont les voix ne s'additionnent pas.
          </p>
        )}
        {national && <TableNuances candidatures={[...ctx.candidats].sort((a, b) => b.voix_total - a.voix_total)} />}
      </section>
    </>
  )
}

function ApercuScore({ ctx, cibles, cible, actions }: Props) {
  const candidatures = cibles.filter((c) => c.candidature)
  const blocs = cibles.filter((c) => c.bloc)
  const selecteur = (
    <label className="champ">
      <span>{ctx.scrutin.portee === 'national' ? 'Candidature ou bloc' : 'Bloc'}</span>
      <select value={cible?.valeur ?? ''} onChange={(e) => actions.cible(e.target.value)}>
        {candidatures.length > 0 && (
          <optgroup label="Candidatures">
            {candidatures.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
          </optgroup>
        )}
        <optgroup label="Blocs">
          {blocs.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
        </optgroup>
      </select>
    </label>
  )
  if (!cible || !ctx.agregatsVoix) {
    return <><ChoixScrutin ctx={ctx} actions={actions} />{selecteur}<p className="note">Chargement des résultats…</p></>
  }
  const france = partsAuNiveau(ctx.agregats, ctx.agregatsVoix, 'france', cible.retenue).get('FR')
  const { hauts, bas } = extremes(partsAuNiveau(ctx.agregats, ctx.agregatsVoix, 'departement', cible.retenue), ctx.index.departements)
  const nom = (code: string) => ctx.index.noms.get(code) ?? code
  return (
    <>
      <ChoixScrutin ctx={ctx} actions={actions} />
      {selecteur}
      <Titre surtitre={`Score · ${ctx.scrutin.libelle}`} titre={cible.libelle}>
        {france != null && `${formatPart(france)} des suffrages exprimés en France. `}
        {hauts.length > 0 && `Par département, de ${formatPart(bas[0][1])} (${nom(bas[0][0])}) à ${formatPart(hauts[0][1])} (${nom(hauts[0][0])}).`}
      </Titre>
      <Extremes hauts={hauts} bas={bas} titres={['Plus élevés', 'Plus faibles']} noms={ctx.index.noms}
        format={(v) => formatPart(v)} onChoisir={choisirDepartement(actions)} />
      {cible.bloc && ctx.scrutin.portee !== 'national' && (
        <p className="note">Là où le bloc n'avait aucune candidature, la carte est hachurée.</p>
      )}
    </>
  )
}

function ApercuParticipation({ ctx, actions }: Props) {
  const france = ctx.agregats.find((a) => a.niveau === 'france')
  const departements = new Map<string, Mesure>(ctx.agregats
    .filter((a) => a.niveau === 'departement' && a.inscrits > 0)
    .map((a) => [a.code, a.votants / a.inscrits]))
  const { hauts, bas } = extremes(departements, ctx.index.departements)
  const nom = (code: string) => ctx.index.noms.get(code) ?? code
  return (
    <>
      <ChoixScrutin ctx={ctx} actions={actions} />
      <Titre surtitre={ctx.scrutin.libelle} titre="Participation">
        {france && `${formatPart(france.votants / france.inscrits)} des inscrits ont voté en France. `}
        {hauts.length > 0 && `Par département, de ${formatPart(bas[0][1])} (${nom(bas[0][0])}) à ${formatPart(hauts[0][1])} (${nom(hauts[0][0])}).`}
      </Titre>
      <Extremes hauts={hauts} bas={bas} titres={['Plus forte', 'Plus faible']} noms={ctx.index.noms}
        format={(v) => formatPart(v)} onChoisir={choisirDepartement(actions)} />
    </>
  )
}

function ApercuEvolutionBloc({ ctx, bloc, evolution, actions }: Props) {
  const choix = (
    <>
      <label className="champ">
        <span>Bloc</span>
        <select value={bloc} onChange={(e) => actions.bloc(e.target.value as BlocColore)}>
          {BLOCS_COLORES.map((b) => <option key={b} value={b}>{LIBELLE_BLOC[b]}</option>)}
        </select>
      </label>
      <label className="champ">
        <span>De</span>
        <select value={evolution?.de.id ?? ''} onChange={(e) => actions.de(e.target.value)}>
          {grouper(ctx.scrutins.filter((s) => s.id !== ctx.scrutin.id)).map((g) => (
            <optgroup key={g.code} label={g.libelle}>
              {g.scrutins.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <ChoixScrutin ctx={ctx} actions={actions} libelle="À" />
    </>
  )
  if (!evolution) return <>{choix}<p className="note">Chargement des résultats…</p></>
  const [avant, apres] = evolution.france
  const { hauts, bas } = extremes(evolution.departements, ctx.index.departements)
  const baisses = bas.filter(([, v]) => v < 0)
  return (
    <>
      {choix}
      <Titre surtitre="Évolution" titre={`Évolution ${DU_BLOC[bloc]}`}>
        {avant != null && apres != null
          ? `${formatPart(avant)} des suffrages exprimés (${evolution.de.libelle}), ${formatPart(apres)} (${ctx.scrutin.libelle}).`
          : `Le bloc n'avait aucune candidature à l'un des deux scrutins.`}
      </Titre>
      <Extremes hauts={hauts.filter(([, v]) => v > 0)} bas={baisses} titres={['Plus fortes hausses', 'Plus fortes baisses']}
        noms={ctx.index.noms} format={(v) => `${formatEcart(v)} pts`} onChoisir={choisirDepartement(actions)} />
      <section className="avertissement">
        <h2>Comparer avec prudence</h2>
        <p>
          L'offre électorale change d'un scrutin à l'autre : une partie des écarts vient des candidatures, pas
          seulement des électeurs.
          {evolution.communesSansObjet > 0 &&
            ` ${formatNombre(evolution.communesSansObjet)} ${pluriel(evolution.communesSansObjet, 'commune')} sont hachurées : le bloc n'y avait aucune candidature à l'un des deux scrutins, ou la commune n'existe pas dans les deux.`}
        </p>
      </section>
    </>
  )
}

