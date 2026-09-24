import type { Classement } from './resume'

interface Props {
  hauts: Classement
  bas: Classement
  titres: [string, string]
  noms: ReadonlyMap<string, string>
  format: (valeur: number) => string
  onChoisir: (code: string) => void
}

/** Deux courtes listes : les territoires aux valeurs les plus hautes et les plus basses. */
export function Extremes({ hauts, bas, titres, noms, format, onChoisir }: Props) {
  const liste = (titre: string, classement: Classement) => (
    <section>
      <h2 className="surtitre">{titre}</h2>
      <ol>
        {classement.map(([code, valeur]) => (
          <li key={code}>
            <button type="button" className="lien" onClick={() => onChoisir(code)}>{noms.get(code) ?? code}</button>
            <span className="nombre">{format(valeur)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
  if (hauts.length === 0) return null
  return (
    <div className="extremes">
      {liste(titres[0], hauts)}
      {liste(titres[1], bas)}
    </div>
  )
}
