import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { Territoire } from '../donnees/types'
import { chercherAdresses, ressembleAUneAdresse, type Adresse } from './adresses'
import { chercher, type Entree } from './chercher'

interface Props {
  entrees: readonly Entree[]
  /** Codes postaux, chargés à la première utilisation du champ. */
  postaux: ReadonlyMap<string, readonly Entree[]> | undefined
  onActiver: () => void
  onChoisir: (territoire: Territoire) => void
  /** Adresse choisie : la carte y pose un repère et y cherche le bureau de vote. */
  onChoisirAdresse: (adresse: Adresse) => void
}

type Suggestion = { type: 'territoire'; entree: Entree } | { type: 'adresse'; adresse: Adresse }

// Le géocodeur n'est interrogé qu'après une courte pause dans la frappe.
const PAUSE = 300

/**
 * Champ de recherche (motif « combobox » de l'ARIA) : communes, départements, circonscriptions et codes postaux
 * de l'index des territoires, puis adresses du géocodeur de la Géoplateforme (IGN).
 */
export function Recherche({ entrees, postaux, onActiver, onChoisir, onChoisirAdresse }: Props) {
  const [texte, setTexte] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [actif, setActif] = useState(-1)
  const id = useId()
  const resultats = useMemo(() => chercher(entrees, texte, 8, postaux), [entrees, texte, postaux])

  const [pose, setPose] = useState('')
  useEffect(() => {
    const minuteur = setTimeout(() => setPose(texte.trim()), PAUSE)
    return () => clearTimeout(minuteur)
  }, [texte])
  // Les adresses d'un texte qu'on est en train de modifier ne s'affichent pas : on ne choisit que les siennes.
  const aJour = pose === texte.trim()
  const adresse = ressembleAUneAdresse(texte)
  const adresses = useQuery({
    queryKey: ['adresses', pose],
    queryFn: ({ signal }) => chercherAdresses(pose, signal),
    enabled: ressembleAUneAdresse(pose),
    staleTime: Infinity,
    retry: false,
  })
  const trouvees = adresse && aJour ? adresses.data ?? [] : []
  const attente = adresse && (!aJour || adresses.isFetching)
  const erreur = adresse && aJour && adresses.isError

  const suggestions: Suggestion[] = [
    ...resultats.map((entree): Suggestion => ({ type: 'territoire', entree })),
    ...trouvees.map((a): Suggestion => ({ type: 'adresse', adresse: a })),
  ]
  // La liste ne s'ouvre que sur des suggestions ; l'attente et l'erreur du géocodeur s'affichent à côté.
  const visible = ouvert && suggestions.length > 0

  const choisir = (s: Suggestion) => {
    if (s.type === 'territoire') onChoisir(s.entree.territoire)
    else onChoisirAdresse(s.adresse)
    setTexte('')
    setOuvert(false)
    setActif(-1)
  }

  const clavier = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOuvert(true)
      setActif((a) => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActif((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      const s = suggestions[Math.max(actif, 0)]
      e.preventDefault()
      // Entrée avant la fin de la pause : les adresses sont demandées tout de suite.
      if (s) choisir(s)
      else setPose(texte.trim())
    } else if (e.key === 'Escape') {
      setOuvert(false)
      setActif(-1)
    }
  }

  const annonce = !ouvert || texte.trim().length < 2 ? ''
    : [
      attente && suggestions.length === 0 ? 'Recherche des adresses' : `${suggestions.length} suggestion${suggestions.length > 1 ? 's' : ''}`,
      erreur ? 'adresses indisponibles pour le moment' : '',
    ].filter(Boolean).join(' ; ')

  const option = (s: Suggestion, i: number) => (
    <li
      key={s.type === 'territoire' ? s.entree.territoire.code : s.adresse.id}
      id={`${id}-${i}`}
      role="option"
      aria-selected={i === actif}
      // Au clic, le champ garderait sinon le focus perdu avant que la suggestion soit choisie.
      onMouseDown={(e) => {
        e.preventDefault()
        choisir(s)
      }}
    >
      {s.type === 'territoire'
        ? (
          <>
            <span>{s.entree.territoire.nom}</span>
            <span className="discret">
              {s.entree.territoire.niveau === 'departement'
                ? `département (${s.entree.territoire.code})`
                : s.entree.territoire.niveau === 'circonscription' ? 'circonscription'
                  : [s.entree.departement, s.entree.precision].filter(Boolean).join(' · ')}
            </span>
          </>
        )
        : (
          <>
            <span>{s.adresse.nom}</span>
            <span className="discret">{s.adresse.precision}</span>
          </>
        )}
    </li>
  )
  const nombreTerritoires = resultats.length

  return (
    <div className="recherche">
      <label className="champ" htmlFor={`${id}-champ`}>
        <span>Aller à une adresse, une commune ou un département</span>
        <input
          id={`${id}-champ`}
          type="search"
          role="combobox"
          aria-expanded={visible}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={visible && actif >= 0 ? `${id}-${actif}` : undefined}
          placeholder="Adresse, nom, code postal ou code INSEE"
          autoComplete="off"
          spellCheck={false}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value)
            setOuvert(true)
            setActif(-1)
          }}
          onKeyDown={clavier}
          onFocus={() => { setOuvert(true); onActiver() }}
          onBlur={() => setOuvert(false)}
        />
      </label>
      {ouvert && (visible || attente || erreur) && (
        <div className="suggestions">
          {visible && (
            <div id={`${id}-liste`} role="listbox" aria-label="Suggestions">
              {nombreTerritoires > 0 && (
                <ul role="group" aria-label="Territoires">
                  {suggestions.slice(0, nombreTerritoires).map((s, i) => option(s, i))}
                </ul>
              )}
              {trouvees.length > 0 && (
                <ul role="group" aria-labelledby={`${id}-adresses`}>
                  <li role="presentation" id={`${id}-adresses`} className="groupe surtitre">Adresses</li>
                  {suggestions.slice(nombreTerritoires).map((s, j) => option(s, nombreTerritoires + j))}
                </ul>
              )}
            </div>
          )}
          {attente && <p className="etat">Recherche des adresses…</p>}
          {erreur && <p className="etat">Adresses indisponibles pour le moment.</p>}
        </div>
      )}
      <p className="visuellement-cache" aria-live="polite">{annonce}</p>
    </div>
  )
}
