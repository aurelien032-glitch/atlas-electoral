import { formatPart } from '../format'

export interface LigneResultat {
  cle: string
  nom: string
  couleur: string
  /** Part des exprimés (0 à 1) dans le territoire, et dans le territoire parent pour comparer. */
  part: number
  partParent?: number
  /** Ligne mise en avant (la cible du mode Score). */
  marquee?: boolean
}

interface Props {
  lignes: LigneResultat[]
  legende: string
  /** Intitulé de la première colonne : « Candidature » ou « Bloc ». */
  entete?: string
  /** Intitulé de la colonne de comparaison (« Lyon », « France »), absent s'il n'y en a pas. */
  parent?: string
}

/** Résultats en tableau : la barre répète la valeur écrite, elle n'en est jamais la seule trace. */
export function Barres({ lignes, legende, entete = 'Candidature', parent }: Props) {
  const max = Math.max(...lignes.map((l) => l.part), 0.0001)
  return (
    <table className="barres">
      <caption className="visuellement-cache">{legende}</caption>
      <thead>
        <tr>
          <th scope="col">{entete}</th>
          <th scope="col"><span className="visuellement-cache">Barre</span></th>
          <th scope="col" className="nombre">Ici</th>
          {parent && <th scope="col" className="nombre">{parent}</th>}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.cle} className={l.marquee ? 'marquee' : undefined}>
            <th scope="row">{l.nom}</th>
            <td className="barre" aria-hidden="true">
              <span style={{ width: `${(100 * l.part) / max}%`, background: l.couleur }} />
            </td>
            <td className="nombre fort">{formatPart(l.part)}</td>
            {parent && <td className="nombre discret">{l.partParent === undefined ? '—' : formatPart(l.partParent)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
