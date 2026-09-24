import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { Territoire } from '../donnees/types'
import { chercher, type Entree } from './chercher'

interface Props {
  entrees: readonly Entree[]
  onChoisir: (territoire: Territoire) => void
}

/** Champ de recherche d'une commune ou d'un département (motif « combobox » de l'ARIA). */
export function Recherche({ entrees, onChoisir }: Props) {
  const [texte, setTexte] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(-1)
  const id = useId()
  const resultats = useMemo(() => chercher(entrees, texte), [entrees, texte])
  const visible = ouvert && resultats.length > 0

  const choisir = (entree: Entree) => {
    onChoisir(entree.territoire)
    setTexte('')
    setOuvert(false)
    setActif(-1)
  }

  const clavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOuvert(true)
      setActif((a) => Math.min(a + 1, resultats.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActif((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      const entree = resultats[Math.max(actif, 0)]
      if (entree) {
        e.preventDefault()
        choisir(entree)
      }
    } else if (e.key === 'Escape') {
      setOuvert(false)
      setActif(-1)
    }
  }

  return (
    <div className="recherche">
      <label className="champ" htmlFor={`${id}-champ`}>
        <span>Aller à une commune ou un département</span>
        <input
          id={`${id}-champ`}
          type="search"
          role="combobox"
          aria-expanded={visible}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={visible && actif >= 0 ? `${id}-${actif}` : undefined}
          placeholder="Nom ou code INSEE"
          autoComplete="off"
          spellCheck={false}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value)
            setOuvert(true)
            setActif(-1)
          }}
          onKeyDown={clavier}
          onFocus={() => setOuvert(true)}
          onBlur={() => setOuvert(false)}
        />
      </label>
      {visible && (
        <ul id={`${id}-liste`} role="listbox" aria-label="Suggestions" className="suggestions">
          {resultats.map((entree, i) => (
            <li
              key={entree.territoire.code}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === actif}
              // Au clic, le champ garderait sinon le focus perdu avant que la suggestion soit choisie.
              onMouseDown={(e) => {
                e.preventDefault()
                choisir(entree)
              }}
            >
              <span>{entree.territoire.nom}</span>
              <span className="discret">
                {entree.territoire.niveau === 'departement' ? `département (${entree.territoire.code})` : entree.departement}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="visuellement-cache" aria-live="polite">
        {ouvert && texte.trim().length >= 2 ? `${resultats.length} suggestion${resultats.length > 1 ? 's' : ''}` : ''}
      </p>
    </div>
  )
}
