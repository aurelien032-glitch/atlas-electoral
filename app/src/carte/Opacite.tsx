import { useEffect, useId, useRef, useState } from 'react'
import { OPACITE_SUR_PLAN } from './couleurs'

interface Props {
  /** Opacité des couleurs au zoom des bureaux, de 0,1 à 1. */
  valeur: number
  /** Zoom des bureaux atteint : le plan IGN est sous les couleurs. */
  actif: boolean
  onChange: (valeur: number) => void
}

/** Bouton sous le zoom : règle l'opacité des couleurs posées sur le plan IGN. */
export function ReglageOpacite({ valeur, actif, onChange }: Props) {
  const [ouvert, setOuvert] = useState(false)
  const id = useId()
  const zone = useRef<HTMLDivElement>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const curseur = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!ouvert) return
    curseur.current?.focus()
    // Un clic en dehors du réglage le ferme (le clavier, lui, passe par la sortie du focus).
    const clic = (e: PointerEvent) => {
      if (e.target instanceof Node && !zone.current?.contains(e.target)) setOuvert(false)
    }
    document.addEventListener('pointerdown', clic)
    return () => document.removeEventListener('pointerdown', clic)
  }, [ouvert])
  const pourcent = Math.round(valeur * 100)
  return (
    <div
      className="opacite" ref={zone}
      // Échap et la sortie du focus ne concernent que le réglage : Échap ailleurs (recherche, onglets) n'y touche pas.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !ouvert) return
        e.stopPropagation()
        setOuvert(false)
        bouton.current?.focus()
      }}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node && zone.current?.contains(e.relatedTarget))) setOuvert(false)
      }}
    >
      <button
        ref={bouton} type="button" className="opacite-bouton" aria-expanded={ouvert} aria-controls={`${id}-reglage`}
        aria-label="Opacité des couleurs" title="Opacité des couleurs" onClick={() => setOuvert(!ouvert)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
        </svg>
      </button>
      {ouvert && (
        <div id={`${id}-reglage`} className="opacite-reglage">
          <label htmlFor={`${id}-curseur`}>
            <span>Opacité des couleurs</span>
            <strong>{pourcent} %</strong>
          </label>
          {/* Hors du zoom des bureaux, le curseur reste atteignable (il garde le focus si la carte dézoome) mais
              n'agit pas ; sa note dit pourquoi. */}
          <input
            ref={curseur} id={`${id}-curseur`} type="range" min={10} max={100} step={10} value={pourcent}
            aria-disabled={!actif} aria-describedby={`${id}-note`} aria-valuetext={`${pourcent} %`}
            onChange={(e) => {
              if (actif) onChange(Number(e.target.value) / 100)
            }}
          />
          <p id={`${id}-note`} className="note-bas">
            {actif ? 'Couleurs des bureaux, posées sur le plan IGN.' : "Au zoom des bureaux, sur le plan IGN : zoomez pour l'utiliser."}
          </p>
          {actif && valeur !== OPACITE_SUR_PLAN && (
            <button type="button" className="lien" onClick={() => onChange(OPACITE_SUR_PLAN)}>
              Revenir à {Math.round(OPACITE_SUR_PLAN * 100)} %
            </button>
          )}
        </div>
      )}
    </div>
  )
}
