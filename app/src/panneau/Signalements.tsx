import { arrondissementDu, communeDu, departementDe } from '../donnees/territoires'
import { formatNombre } from '../format'
import type { Selection } from '../vue'
import type { Contexte } from './contexte'
import { enumerer } from './resume'

type Aberrant = NonNullable<Contexte['scrutin']['inscrits_aberrants']>[number]

const pourcent = (part: number) => `${Math.round(100 * part)} %`
const chiffres = (b: Aberrant) => `${formatNombre(b.inscrits)} inscrits pour ${formatNombre(b.votants)} votants`

/**
 * Vue nationale : ce que la source ne contient pas (territoires absents ou incomplets) et les erreurs de
 * saisie qui faussent la participation. Signalé, jamais corrigé : l'outil montre la source telle qu'elle est.
 */
export function CouvertureNationale({ ctx }: { ctx: Contexte }) {
  const nom = (code: string) => ctx.index.noms.get(code) ?? code
  const absents = ctx.scrutin.territoires_absents ?? []
  const partiels = ctx.scrutin.territoires_partiels ?? []
  const aberrants = ctx.scrutin.inscrits_aberrants ?? []
  const manques = [
    absents.length > 0 && `la source (data.gouv.fr) ne contient aucun résultat pour ${enumerer(absents.map(nom))}`,
    partiels.length > 0 && `${absents.length > 0 ? 'elle' : 'la source (data.gouv.fr)'} est incomplète pour ${enumerer(partiels.map((p, i) =>
      `${nom(p.code)} (${pourcent(p.part)}${i === partiels.length - 1 ? ' des inscrits attendus' : ''})`))}`,
  ].filter((m): m is string => typeof m === 'string')
  if (manques.length === 0 && aberrants.length === 0) return null
  // Noms des communes seulement quand l'index complet est là : pas de code INSEE dans une phrase.
  const codes = [...new Set(aberrants.map((b) => communeDu(b.code_bv, ctx.index.passage)))]
  const communes = codes.every((c) => ctx.index.noms.has(c)) ? ` à ${enumerer(codes.map(nom))}` : ''
  return (
    <>
      {manques.length > 0 && (
        <p className="note-bas">
          Données partielles : {manques.join(' ; ')}. Les totaux et les parts de la France entière diffèrent donc des
          résultats officiels.
        </p>
      )}
      {aberrants.length > 0 && (
        <p className="note-bas">
          Nombre d'inscrits manifestement erroné dans la source pour {aberrants.length > 1 ? `${aberrants.length} bureaux` : 'un bureau'}
          {communes} (par exemple {chiffres(aberrants[0])}) : la participation de ces territoires est faussée.
        </p>
      )}
    </>
  )
}

/** Fiche d'un territoire : département incomplet dans la source, bureau aux inscrits erronés qu'il contient. */
export function SignalementsTerritoire({ ctx, selection }: { ctx: Contexte; selection: Selection }) {
  const commune = (codeBv: string) => communeDu(codeBv, ctx.index.passage)
  const contient = (codeBv: string) => {
    switch (selection.niveau) {
      case 'bureau': return codeBv === selection.code
      case 'commune': return commune(codeBv) === selection.code
      case 'arrondissement': return arrondissementDu(codeBv) === selection.code
      case 'departement': return departementDe(commune(codeBv)) === selection.code
      default: return false
    }
  }
  const aberrants = (ctx.scrutin.inscrits_aberrants ?? []).filter((b) => contient(b.code_bv))
  const partiel = selection.niveau === 'departement'
    ? ctx.scrutin.territoires_partiels?.find((p) => p.code === selection.code)
    : undefined
  if (!partiel && aberrants.length === 0) return null
  return (
    <>
      {partiel && (
        <p className="alerte">
          Résultats incomplets : la source ne couvre qu'environ {pourcent(partiel.part)} des inscrits attendus dans ce
          département. Les chiffres ci-dessous n'en montrent qu'une partie.
        </p>
      )}
      {aberrants.length > 0 && (
        <p className="alerte">
          Nombre d'inscrits manifestement erroné dans la source ({enumerer(aberrants.map(chiffres))}
          {selection.niveau === 'bureau' ? '' : `, ${aberrants.length > 1 ? 'dans des bureaux' : 'dans un bureau'} de ce territoire`}) : la
          participation est faussée.
        </p>
      )}
    </>
  )
}
