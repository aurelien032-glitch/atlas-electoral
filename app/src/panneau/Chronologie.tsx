import { useId, useMemo, useState } from 'react'
import { BLOCS_SERIE, plafond, pointsDuType, typesCouverts } from '../calculs/series'
import { BLOCS_COLORES, COULEUR_BLOC, LIBELLE_BLOC, RAMPE_PARTICIPATION } from '../carte/couleurs'
import { TYPES, typeDe } from '../donnees/scrutins'
import type { LigneSerie, ScrutinCatalogue } from '../donnees/types'
import { formatPart } from '../format'
import { Courbes, type SerieCourbe } from './Courbes'

interface Props {
  /** Tours du territoire suivi ; undefined pendant le chargement. */
  lignes: readonly LigneSerie[] | undefined
  erreur: boolean
  scrutins: readonly ScrutinCatalogue[]
  /** Scrutin affiché sur la carte : son type est proposé d'abord, et son année repérée. */
  courant: ScrutinCatalogue
  niveau: 'france' | 'departement' | 'circonscription' | 'commune'
  /** Précision du titre quand la série n'est pas celle du territoire choisi (bureau → commune). */
  precision?: string
  /** Commune née d'une fusion : ses tours anciens additionnent les communes qui l'ont formée. */
  fusion?: boolean
}

const LIBELLE_TYPE = new Map<string, string>(TYPES.map((t) => [t.code, t.libelle]))
const enPoints = (v: number | null) => (v === null ? null : 100 * v)

/**
 * « Au fil des scrutins » : les premiers tours d'un type d'élection pour un territoire, en deux
 * graphiques (parts des blocs, participation) doublés d'un tableau. Un type à la fois : une
 * présidentielle et des municipales ne se comparent pas.
 */
export function Chronologie({ lignes, erreur, scrutins, courant, niveau, precision, fusion }: Props) {
  const idTitre = useId()
  const types = useMemo(() => (lignes ? typesCouverts(lignes) : []), [lignes])
  const [choix, setChoix] = useState<string | null>(null)
  const type = choix !== null && types.includes(choix) ? choix : types.includes(typeDe(courant.id)) ? typeDe(courant.id) : types[0]
  const points = useMemo(() => (lignes && type ? pointsDuType(lignes, scrutins, type) : []), [lignes, scrutins, type])
  const [survol, setSurvol] = useState<number | null>(null)
  // Le point survolé se perd quand la série change (autre territoire, autre type).
  const actif = survol !== null && survol < points.length ? survol : null

  const titre = <h2 className="surtitre" id={idTitre}>Au fil des scrutins{precision && ` · ${precision}`}</h2>
  const message = erreur ? 'Historique indisponible pour le moment.'
    : !lignes ? "Chargement de l'historique…"
      : !type || points.length < 2 ? 'Trop peu de scrutins ici pour tracer une évolution.' : undefined
  if (message) return <section className="chronologie" aria-labelledby={idTitre}>{titre}<p className="note">{message}</p></section>

  const series: SerieCourbe[] = BLOCS_COLORES
    .map((b) => ({ cle: b, libelle: LIBELLE_BLOC[b], couleur: COULEUR_BLOC[b], valeurs: points.map((p) => enPoints(p.parts[b])) }))
    // Un bloc absent de tous ces scrutins n'aurait qu'une ligne à zéro : il reste dans le tableau.
    .filter((s) => s.valeurs.some((v) => v !== null && v > 0))
  const participation: SerieCourbe[] = [{
    cle: 'participation', libelle: 'Participation', couleur: RAMPE_PARTICIPATION[3], valeurs: points.map((p) => enPoints(p.participation)),
  }]
  const abscisses = points.map((p) => ({ date: Date.parse(p.scrutin.date), annee: p.scrutin.date.slice(0, 4), libelle: p.scrutin.libelle }))
  const indexCourant = points.findIndex((p) => p.scrutin.id === courant.id)
  const courantVisible = indexCourant >= 0 ? indexCourant : undefined
  const { haut, pas } = plafond(Math.max(...series.flatMap((s) => s.valeurs.map((v) => v ?? 0)), 1))
  const horsBlocs = (i: number) => {
    const { DIV, NC } = points[i].parts
    return DIV === null && NC === null ? null : 100 * ((DIV ?? 0) + (NC ?? 0))
  }
  const libelleType = (LIBELLE_TYPE.get(type) ?? type).toLowerCase()
  const periode = `${abscisses[0].annee} à ${abscisses[abscisses.length - 1].annee}`

  const notes = [
    'Premiers tours, en % des suffrages exprimés (participation : en % des inscrits).',
    "Blocs de la grille de 2026, appliquée à tous les scrutins : l'offre politique change d'un scrutin à l'autre.",
    'Divers et non classés : dans les données.',
  ]
  if (type === 'muni' && niveau !== 'commune') {
    notes.push('Municipales : parts calculées sur les communes votant par listes, de 3 500 habitants et plus en 2008, de 1 000 et plus en 2014 et 2020, toutes en 2026.')
  }
  if (type === 'cant' && niveau !== 'commune') notes.push("Cantonales : renouvellement par moitié, chaque scrutin ne couvre qu'une partie des cantons.")
  notes.push('Tiret ou courbe interrompue : pas de candidat du bloc.')
  if (points.some((p) => p.panachage)) {
    const annees = points.filter((p) => p.panachage).map((p) => p.scrutin.date.slice(0, 4)).join(' et ')
    notes.push(`En ${annees}, aucune part : on votait pour des personnes (panachage).`)
  }
  if (fusion) notes.push("Commune née d'une fusion : avant celle-ci, les résultats additionnent les communes qui l'ont formée.")

  return (
    <section className="chronologie" aria-labelledby={idTitre}>
      {titre}
      <label className="champ">
        Type d'élection
        <select value={type} onChange={(e) => { setChoix(e.target.value); setSurvol(null) }}>
          {types.map((t) => <option key={t} value={t}>{LIBELLE_TYPE.get(t) ?? t}</option>)}
        </select>
      </label>
      {series.length > 0
        ? (
          <>
            <ul className="cles" aria-label="Légende des courbes">
              {series.map((s) => <li key={s.cle}><span className="cle-ligne" style={{ background: s.couleur }} />{s.libelle}</li>)}
            </ul>
            <Courbes
              points={abscisses} series={series} haut={haut} pas={pas} hauteur={170}
              actif={actif} onActif={setSurvol} courant={courantVisible}
              libelle={`Parts des blocs aux ${libelleType}, premiers tours de ${periode}`}
              complements={(i) => [{ libelle: 'Divers et non classés', valeur: horsBlocs(i) }]}
            />
          </>
        )
        : <p className="note">Aucune candidature classée dans les cinq blocs pour ces scrutins.</p>}
      <p className="sous-titre-courbe">Participation</p>
      <Courbes
        points={abscisses} series={participation} haut={100} pas={50} hauteur={56}
        actif={actif} onActif={setSurvol} courant={courantVisible}
        libelle={`Participation aux ${libelleType}, premiers tours de ${periode}`}
      />
      <details className="donnees-courbes">
        <summary>Voir les données</summary>
        <div className="defilement" role="region" aria-label="Tableau des données" tabIndex={0}>
          <table>
            <caption className="visuellement-cache">{`Parts des blocs et participation aux ${libelleType}, premiers tours`}</caption>
            <thead>
              <tr>
                <th scope="col">Bloc</th>
                {abscisses.map((a, i) => <th key={points[i].scrutin.id} scope="col" className="nombre">{a.annee}</th>)}
              </tr>
            </thead>
            <tbody>
              {BLOCS_SERIE.map((b) => (
                <tr key={b}>
                  <th scope="row">{LIBELLE_BLOC[b]}</th>
                  {points.map((p) => {
                    const v = p.parts[b]
                    return <td key={p.scrutin.id} className="nombre">{v === null ? '—' : formatPart(v)}</td>
                  })}
                </tr>
              ))}
              <tr className="separe">
                <th scope="row">Participation</th>
                {points.map((p) => (
                  <td key={p.scrutin.id} className="nombre">{p.participation === null ? '—' : formatPart(p.participation)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <p className="note-bas">{notes.join(' ')}</p>
    </section>
  )
}
