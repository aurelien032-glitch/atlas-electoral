import type { ClasseLegende } from '../modes'
import { formatNombre } from '../format'
import { BLOCS_COLORES, COULEUR_BLOC, GRIS, LIBELLE_BLOC } from './couleurs'

export type DescriptionLegende =
  | {
      type: 'tete'
      /** Part des inscrits couverte par les contours, quand la carte s'arrête à la commune. */
      couvertureCommune: number | null
    }
  | {
      type: 'classes'
      titre: string
      sousTitre: string
      classes: ClasseLegende[]
      sansObjet: number
      libelleSansObjet: string
    }

function Pastille({ couleur }: { couleur: string }) {
  return <span className="pastille" style={{ background: couleur }} />
}

const Hachures = () => <span className="pastille hachuree" />
const SansResultat = () => <span className="pastille vide" />

export function Legende({ description, className }: { description: DescriptionLegende; className: string }) {
  if (description.type === 'tete') {
    return (
      <section className={`legende ${className}`} aria-label="Légende de la carte">
        <h2 className="legende-titre">Bloc en tête</h2>
        <ul>
          {BLOCS_COLORES.map((bloc) => (
            <li key={bloc}><Pastille couleur={COULEUR_BLOC[bloc]} />{LIBELLE_BLOC[bloc]}</li>
          ))}
          <li><Pastille couleur={GRIS.divers} />Divers</li>
          <li>
            <Pastille couleur={GRIS.nonClasse} />
            <span>Non classé <small>: candidatures sans nuance du ministère, dans les petites communes</small></span>
          </li>
          <li><Pastille couleur={GRIS.egalite} />Égalité en tête</li>
          <li><SansResultat />Pas de résultat</li>
        </ul>
        <p className="legende-note">L'avance sur le suivant (serrée, nette, large) est donnée au survol et dans la fiche.</p>
        {description.couvertureCommune !== null && (
          <p className="legende-note">
            Carte à la commune : les contours de bureaux datent de 2022 et ne couvrent que{' '}
            {(100 * description.couvertureCommune).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % des inscrits de ce scrutin.
          </p>
        )}
      </section>
    )
  }
  return (
    <section className={`legende ${className}`} aria-label="Légende de la carte">
      <h2 className="legende-titre">{description.titre}</h2>
      <p className="legende-sous-titre">{description.sousTitre}</p>
      <ul>
        {description.classes.map((c) => (
          <li key={c.libelle}>
            <Pastille couleur={c.couleur} />
            <span className="libelle">{c.libelle}</span>
            <span className="nombre discret">{formatNombre(c.nombre)}</span>
          </li>
        ))}
        {description.sansObjet > 0 && (
          <li>
            <Hachures />
            <span className="libelle">{description.libelleSansObjet}</span>
            <span className="nombre discret">{formatNombre(description.sansObjet)}</span>
          </li>
        )}
        <li><SansResultat /><span className="libelle">Pas de résultat</span></li>
      </ul>
    </section>
  )
}
