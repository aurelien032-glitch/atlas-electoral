import { BLOCS_COLORES, LIBELLE_BLOC, type BlocColore } from '../carte/couleurs'
import type { Cible } from '../cibles'
import { grouper, scrutinsAnterieurs } from '../donnees/scrutins'
import type { ScrutinCatalogue } from '../donnees/types'
import type { Mode } from '../modes'
import type { Actions } from './contexte'

interface Props {
  /** Scrutin affiché et catalogue : les réglages n'attendent pas les résultats (le focus reste au sélecteur). */
  scrutin: ScrutinCatalogue
  scrutins: readonly ScrutinCatalogue[]
  mode: Mode
  cibles: Cible[]
  cible: Cible | undefined
  bloc: BlocColore
  /** Évolution : scrutin de départ ; undefined quand aucun ne précède le scrutin d'arrivée. */
  de: ScrutinCatalogue | undefined
  actions: Actions
}

function ChoixScrutin({ libelle, scrutins, valeur, onChoisir }: {
  libelle: string
  scrutins: readonly ScrutinCatalogue[]
  valeur: string
  onChoisir: (id: string) => void
}) {
  return (
    <label className="champ">
      <span>{libelle}</span>
      <select value={valeur} onChange={(e) => onChoisir(e.target.value)}>
        {grouper(scrutins).map((g) => (
          <optgroup key={g.code} label={g.libelle}>
            {g.scrutins.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/**
 * Ce que montrent la carte et le panneau : le scrutin et, selon le mode, la candidature ou le bloc suivis.
 * Au même endroit dans la vue nationale et dans la fiche d'un territoire : on change de scrutin ou de cible
 * sans quitter le territoire choisi.
 */
export function Reglages({ scrutin, scrutins, mode, cibles, cible, bloc, de, actions }: Props) {
  if (mode === 'evolution') {
    const anterieurs = scrutinsAnterieurs(scrutins, scrutin)
    return (
      <div className="reglages">
        <label className="champ">
          <span>Bloc</span>
          <select value={bloc} onChange={(e) => actions.bloc(e.target.value as BlocColore)}>
            {BLOCS_COLORES.map((b) => <option key={b} value={b}>{LIBELLE_BLOC[b]}</option>)}
          </select>
        </label>
        {anterieurs.length > 0 && <ChoixScrutin libelle="De" scrutins={anterieurs} valeur={de?.id ?? ''} onChoisir={actions.de} />}
        <ChoixScrutin libelle="À" scrutins={scrutins} valeur={scrutin.id} onChoisir={actions.scrutin} />
      </div>
    )
  }
  const candidatures = cibles.filter((c) => c.candidature)
  const blocs = cibles.filter((c) => c.bloc)
  return (
    <div className="reglages">
      <ChoixScrutin libelle="Scrutin" scrutins={scrutins} valeur={scrutin.id} onChoisir={actions.scrutin} />
      {mode === 'score' && cibles.length > 0 && (
        <label className="champ">
          <span>{candidatures.length > 0 ? 'Candidature ou bloc' : 'Bloc'}</span>
          <select value={cible?.valeur ?? ''} onChange={(e) => actions.cible(e.target.value)}>
            {candidatures.length > 0 && (
              <optgroup label="Candidatures">
                {candidatures.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
              </optgroup>
            )}
            <optgroup label="Blocs">
              {blocs.map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
            </optgroup>
          </select>
        </label>
      )}
    </div>
  )
}
