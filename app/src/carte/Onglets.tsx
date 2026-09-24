import { LIBELLE_MODE, MODES, type Mode } from '../modes'

export function Onglets({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  return (
    <div className="onglets" role="group" aria-label="Ce que montre la carte">
      {MODES.map((m) => (
        <button key={m} type="button" aria-pressed={m === mode} onClick={() => onMode(m)}>
          {LIBELLE_MODE[m]}
        </button>
      ))}
    </div>
  )
}
