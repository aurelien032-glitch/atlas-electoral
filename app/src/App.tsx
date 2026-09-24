import { useMemo, useState } from 'react'
import { Carte, type Survol } from './carte/Carte'
import { useAgregats, useBureaux, useCandidats, useCatalogue, useContours } from './donnees/requetes'
import type { Bloc, Resultat } from './donnees/types'
import { Detail } from './panneau/Detail'
import { Legende } from './panneau/Legende'
import { useParametreUrl } from './url'

export default function App() {
  const catalogue = useCatalogue()
  const [idUrl, choisirScrutin] = useParametreUrl('scrutin')
  const scrutins = catalogue.data?.scrutins ?? []
  const scrutin = scrutins.find((s) => s.id === idUrl) ?? scrutins[0]

  const bureaux = useBureaux(scrutin?.id)
  const agregats = useAgregats(scrutin?.id)
  const candidats = useCandidats(scrutin?.id)
  const contours = useContours()
  const [survol, setSurvol] = useState<Survol | null>(null)

  const parCand = useMemo(() => new Map((candidats.data ?? []).map((c) => [c.cand, c])), [candidats.data])
  const blocDe = useMemo(() => (cand: number): Bloc => parCand.get(cand)?.bloc ?? 'NC', [parCand])
  const communes = useMemo(() => (agregats.data ?? []).filter((a) => a.niveau === 'commune'), [agregats.data])
  const index = useMemo(() => ({
    bureau: new Map<string, Resultat>((bureaux.data ?? []).map((b) => [b.code_bv, b])),
    commune: new Map<string, Resultat>(communes.map((c) => [c.code, c])),
  }), [bureaux.data, communes])

  const chargement = catalogue.isPending || bureaux.isPending || agregats.isPending || candidats.isPending || contours.isPending
  const erreur = catalogue.error ?? bureaux.error ?? agregats.error ?? candidats.error ?? contours.error

  return (
    <div className="atlas">
      <Carte
        bureaux={bureaux.data ?? []}
        communes={communes}
        contours={contours.data ?? []}
        blocDe={blocDe}
        niveau={scrutin?.jointure_contours?.niveau_carte ?? 'commune'}
        onSurvol={setSurvol}
      />
      <aside className="panneau">
        <h1>Atlas électoral</h1>
        <label className="selecteur">
          <span>Scrutin</span>
          <select value={scrutin?.id ?? ''} onChange={(e) => choisirScrutin(e.target.value)}>
            {scrutins.map((s) => <option key={s.id} value={s.id}>{s.libelle}</option>)}
          </select>
        </label>
        {erreur && <p className="alerte">Données indisponibles : {erreur.message}</p>}
        {chargement && !erreur && <p className="note">Chargement…</p>}
        {scrutin && <Legende scrutin={scrutin} />}
        <div className="detail" aria-live="polite">
          <Detail survol={survol} resultat={survol ? index[survol.niveau].get(survol.code) : undefined} candidats={parCand} />
        </div>
        <p className="sources">
          Résultats : ministère de l'Intérieur, via data.gouv.fr. Contours des bureaux : data.gouv.fr (REU 2022,
          indicatifs). Limites administratives : IGN, contours simplifiés par Etalab (COG 2026). Blocs : circulaire du
          ministère de l'Intérieur de février 2026, appliquée à tous les scrutins.
        </p>
      </aside>
    </div>
  )
}
