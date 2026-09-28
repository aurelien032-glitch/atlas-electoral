import { formatNombre, formatPart } from '../format'

export interface LigneResultat {
  cle: string
  nom: string
  couleur: string
  /** Voix dans le territoire, écrites sous la part. */
  voix: number
  /** Part des exprimés (0 à 1) dans le territoire, et dans le territoire parent pour comparer. */
  part: number
  partParent?: number
  /** Ligne mise en avant (la cible du mode Score). */
  marquee?: boolean
  /** Précision après le nom (« élue »). */
  mention?: string
  /** Seconde ligne, sous le nom : nuance officielle et bloc. */
  detail?: string
}

interface Props {
  lignes: LigneResultat[]
  legende: string
  /** Intitulé de la première colonne : « Candidature » ou « Bloc ». */
  entete?: string
  /** Intitulé de la colonne de comparaison (« Lyon », « France »), absent s'il n'y en a pas. */
  parent?: string
  /** Intitulé affiché à sa place quand il est long (« 2e circ. ») ; le complet reste lu par un lecteur d'écran. */
  parentCourt?: string
}

/** Résultats en tableau : la barre répète la valeur écrite, elle n'en est jamais la seule trace. */
export function Barres({ lignes, legende, entete = 'Candidature', parent, parentCourt }: Props) {
  const max = Math.max(...lignes.map((l) => l.part), 0.0001)
  return (
    <table className="barres">
      <caption className="visuellement-cache">{legende}</caption>
      <thead>
        <tr>
          <th scope="col">{entete}</th>
          <th scope="col" aria-hidden="true" />
          <th scope="col" className="nombre">Ici</th>
          {parent && (
            <th scope="col" className="nombre">
              {parentCourt
                ? <><span aria-hidden="true">{parentCourt}</span><span className="visuellement-cache">{parent}</span></>
                : parent}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l) => (
          <tr key={l.cle} className={l.marquee ? 'marquee' : undefined}>
            <th scope="row">
              {l.nom}{l.mention && <span className="mention">{l.mention}</span>}
              {l.detail && <span className="sous-ligne">{l.detail}</span>}
            </th>
            <td className="barre" aria-hidden="true">
              <span style={{ width: `${(100 * l.part) / max}%`, background: l.couleur }} />
            </td>
            <td className="nombre">
              <span className="fort">{formatPart(l.part)}</span>
              <span className="sous-ligne">{formatNombre(l.voix)} voix</span>
            </td>
            {parent && <td className="nombre discret">{l.partParent === undefined ? '—' : formatPart(l.partParent)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
