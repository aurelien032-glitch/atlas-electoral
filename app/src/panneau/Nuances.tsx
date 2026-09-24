import { LIBELLE_BLOC } from '../carte/couleurs'
import { nomCandidature } from '../donnees/libelles'
import type { Candidature } from '../donnees/types'

/** Les trois couches du classement (§ 8.2 du plan), pour chaque candidature affichée. */
export function TableNuances({ candidatures }: { candidatures: readonly Candidature[] }) {
  if (candidatures.length === 0) return null
  return (
    <details className="depliant">
      <summary>Nuances, familles et blocs</summary>
      <div className="defilement" role="region" aria-label="Nuances, familles et blocs" tabIndex={0}>
        <table className="nuances">
          <thead>
            <tr>
              <th scope="col">Candidature</th>
              <th scope="col">Nuance</th>
              <th scope="col">Famille</th>
              <th scope="col">Bloc</th>
            </tr>
          </thead>
          <tbody>
            {candidatures.map((c) => (
              <tr key={c.cand}>
                <th scope="row">{nomCandidature(c)}</th>
                <td>
                  <abbr title={c.nuance_libelle ?? undefined}>{c.nuance}</abbr>
                  {c.nuance_libelle && <span className="discret"> {c.nuance_libelle}</span>}
                  {c.origine_nuance === 'attribuée' && <span className="mention">attribuée</span>}
                  {c.cas_limite && <span className="mention">cas limite</span>}
                </td>
                <td>{c.famille}</td>
                <td>{LIBELLE_BLOC[c.bloc]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note-bas">
        Nuance officielle : celle du ministère de l'Intérieur, jamais modifiée ; « attribuée » quand le ministère
        n'en donne pas (candidat à la présidentielle, liste européenne). Famille et bloc : grille du projet et
        circulaire de février 2026 (fichier referentiels/nuances.csv).
      </p>
    </details>
  )
}
