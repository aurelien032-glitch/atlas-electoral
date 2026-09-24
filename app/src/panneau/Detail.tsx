import type { Survol } from '../carte/Carte'
import { LIBELLE_BLOC, palier } from '../carte/couleurs'
import { nomCandidature } from '../donnees/libelles'
import type { Candidature, Resultat } from '../donnees/types'

const nombre = new Intl.NumberFormat('fr-FR')
const pourcentage = (x: number) => `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

interface Props {
  survol: Survol | null
  resultat: Resultat | undefined
  candidats: Map<number, Candidature>
}

export function Detail({ survol, resultat, candidats }: Props) {
  if (!survol) return <p className="note">Survolez ou touchez un territoire.</p>
  const titre = survol.niveau === 'bureau' ? `${survol.nom} — bureau ${survol.numero ?? ''}` : survol.nom
  if (!resultat) return <><h2>{titre}</h2><p className="note">Aucun résultat rattaché à ce territoire pour ce scrutin.</p></>
  if (resultat.exprimes === 0 || resultat.tete === null) return <><h2>{titre}</h2><p className="note">Aucun suffrage exprimé.</p></>

  const tete = candidats.get(resultat.tete)
  const avance = resultat.egalite
    ? 'égalité en tête'
    : `avance de ${((resultat.avance_x10000 ?? 0) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} points (${palier(resultat.avance_x10000 ?? 0).libelle})`
  return (
    <>
      <h2>{titre}</h2>
      <p className="note">
        {nombre.format(resultat.inscrits)} inscrits · participation {pourcentage(resultat.votants / resultat.inscrits)}
      </p>
      {resultat.votants > resultat.inscrits && (
        <p className="alerte">Plus de votants que d'inscrits : anomalie présente dans les données officielles.</p>
      )}
      {tete && (
        <p>
          En tête : <strong>{nomCandidature(tete)}</strong>
          <br />
          {LIBELLE_BLOC[tete.bloc]} · nuance {tete.nuance}
          {tete.origine_nuance === 'attribuée' && ' (attribuée)'}
          {tete.cas_limite && ' · cas limite'}
          <br />
          {avance}
        </p>
      )}
    </>
  )
}
