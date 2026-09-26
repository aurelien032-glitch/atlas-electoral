import { useId } from 'react'
import { Chevron } from '../Chevron'
import type { ClasseLegende } from '../modes'
import { formatNombre } from '../format'
import { BLOCS_COLORES, COULEUR_BLOC, GRIS, LIBELLE_BLOC } from './couleurs'

export type DescriptionLegende =
  | { type: 'tete' }
  | {
      type: 'classes'
      titre: string
      sousTitre: string
      classes: ClasseLegende[]
      sansObjet: number
      libelleSansObjet: string
    }

interface Props {
  description: DescriptionLegende
  /** Jusqu'où descend la carte, et ce qu'elle montre là où manquent les contours de bureaux. */
  note?: string
  className: string
  /** Repliée sur son titre : la carte se lit en plus grand, le titre dit encore ce qu'elle montre. */
  replie: boolean
  onBasculer: () => void
}

function Pastille({ couleur }: { couleur: string }) {
  return <span className="pastille" style={{ background: couleur }} />
}

const Hachures = () => <span className="pastille hachuree" />
const SansResultat = () => <span className="pastille vide" />

function Corps({ description }: { description: DescriptionLegende }) {
  if (description.type === 'tete') {
    return (
      <>
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
      </>
    )
  }
  return (
    <>
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
    </>
  )
}

export function Legende({ description, note, className, replie, onBasculer }: Props) {
  const id = useId()
  return (
    <section className={`legende ${className}`} data-replie={replie} aria-label="Légende de la carte">
      <h2 className="legende-titre">
        <button type="button" aria-expanded={!replie} aria-controls={replie ? undefined : id} onClick={onBasculer}>
          <span>{description.type === 'tete' ? 'Bloc en tête' : description.titre}</span>
          <Chevron ouvert={!replie} />
        </button>
      </h2>
      {!replie && (
        <div id={id} className="legende-corps">
          <Corps description={description} />
          {note && <p className="legende-note">{note}</p>}
        </div>
      )}
    </section>
  )
}
