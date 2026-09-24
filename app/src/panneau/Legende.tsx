import { BLOCS_COLORES, COULEUR_BLOC, GRIS, LIBELLE_BLOC, PALIERS } from '../carte/couleurs'
import type { ScrutinCatalogue } from '../donnees/types'

function Pastille({ couleur, opacite = 1 }: { couleur: string; opacite?: number }) {
  return <span className="pastille" style={{ background: couleur, opacity: opacite }} />
}

export function Legende({ scrutin }: { scrutin: ScrutinCatalogue }) {
  const jointure = scrutin.jointure_contours
  return (
    <section className="legende" aria-label="Légende">
      <p className="entete">Bloc en tête · avance : {PALIERS.map((p) => p.libelle).join(', ')}</p>
      <ul>
        {BLOCS_COLORES.map((bloc) => (
          <li key={bloc}>
            <span className="pastilles">
              {PALIERS.map((p) => <Pastille key={p.libelle} couleur={COULEUR_BLOC[bloc]} opacite={p.opacite} />)}
            </span>
            {LIBELLE_BLOC[bloc]}
          </li>
        ))}
        <li><span className="pastilles"><Pastille couleur={GRIS.divers} /></span>Divers</li>
        <li>
          <span className="pastilles"><Pastille couleur={GRIS.nonClasse} /></span>
          <span>Non classé <small>: le ministère n'attribue pas de nuance dans les petites communes</small></span>
        </li>
        <li><span className="pastilles"><Pastille couleur={GRIS.egalite} /></span>Égalité en tête</li>
        <li><span className="pastilles"><Pastille couleur={GRIS.sansResultat} /></span>Aucun résultat rattaché</li>
      </ul>
      {jointure?.niveau_carte === 'commune' && (
        <p className="note">
          Carte à la commune : les contours de bureaux, qui datent de 2022, ne couvrent que{' '}
          {(100 * jointure.taux_inscrits_metropole).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % des
          inscrits de ce scrutin.
        </p>
      )}
    </section>
  )
}
