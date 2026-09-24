import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { etiquettesGardees } from '../calculs/series'
import { formatPourcent } from '../format'

export interface SerieCourbe {
  cle: string
  libelle: string
  couleur: string
  /** Valeur de chaque point, en points de pourcentage ; null coupe la courbe (sans objet). */
  valeurs: readonly (number | null)[]
}

/** Ligne ajoutée à l'infobulle sans être tracée (divers et non classés). */
export interface Complement {
  libelle: string
  valeur: number | null
}

interface Props {
  /** Abscisses (date en millisecondes), année écrite sous l'axe et libellé complet de chaque point. */
  points: readonly { date: number; annee: string; libelle: string }[]
  series: readonly SerieCourbe[]
  /** Haut de l'axe des valeurs et pas des lignes de repère, en points. */
  haut: number
  pas: number
  /** Hauteur de la zone de tracé, en pixels. */
  hauteur: number
  /** Point survolé ou choisi au clavier, partagé par les graphiques d'une même vue. */
  actif: number | null
  onActif: (index: number | null) => void
  /** Point du scrutin affiché sur la carte, repéré sur l'axe. */
  courant?: number
  /** Nom accessible du graphique. */
  libelle: string
  complements?: (index: number) => Complement[]
}

const MARGE = { gauche: 38, droite: 16, haut: 8, bas: 24 }
const ECART_ANNEES = 34

function useLargeur() {
  const ref = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(380)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observateur = new ResizeObserver(([entree]) => setLargeur(Math.round(entree.contentRect.width)))
    observateur.observe(element)
    return () => observateur.disconnect()
  }, [])
  return [ref, largeur] as const
}

/** Tracé d'une courbe : segments continus, coupés là où la valeur manque. */
function trace(valeurs: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  let d = ''
  let ouvert = false
  valeurs.forEach((v, i) => {
    if (v === null) { ouvert = false; return }
    d += `${ouvert ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
    ouvert = true
  })
  return d
}

/**
 * Courbes en SVG : lignes de 2 px, repères en filet, réticule vertical qui suit le pointeur (ou les
 * flèches du clavier) et infobulle qui donne toutes les séries du scrutin visé. Les valeurs restent
 * lisibles sans survol dans le tableau qui accompagne chaque graphique.
 */
export function Courbes({ points, series, haut, pas, hauteur, actif, onActif, courant, libelle, complements }: Props) {
  const [conteneur, largeur] = useLargeur()
  const [ici, setIci] = useState(false)
  const n = points.length
  const trace0 = points[0]?.date ?? 0
  const trace1 = points[n - 1]?.date ?? 0
  const largeurTrace = Math.max(largeur - MARGE.gauche - MARGE.droite, 10)
  const x = (i: number) => MARGE.gauche + (trace1 === trace0 ? largeurTrace / 2 : ((points[i].date - trace0) / (trace1 - trace0)) * largeurTrace)
  const y = (v: number) => MARGE.haut + hauteur - (Math.min(v, haut) / haut) * hauteur
  const reperes = Array.from({ length: Math.floor(haut / pas) + 1 }, (_, i) => i * pas)
  const annees = etiquettesGardees(points.map((_, i) => x(i)), ECART_ANNEES)

  const plusProche = (e: PointerEvent<HTMLDivElement>) => {
    const gauche = e.currentTarget.getBoundingClientRect().left
    let meilleur = 0
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - (e.clientX - gauche)) < Math.abs(x(meilleur) - (e.clientX - gauche))) meilleur = i
    return meilleur
  }
  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const suivant = { ArrowRight: Math.min(n - 1, (actif ?? -1) + 1), ArrowLeft: Math.max(0, (actif ?? n) - 1), Home: 0, End: n - 1 }[e.key]
    if (suivant !== undefined) { e.preventDefault(); onActif(suivant) }
    else if (e.key === 'Escape') onActif(null)
  }

  const lignesBulle = actif === null ? [] : [
    ...series.map((s) => ({ cle: s.cle, libelle: s.libelle, couleur: s.couleur, valeur: s.valeurs[actif] })),
    ...(complements?.(actif) ?? []).map((c) => ({ cle: c.libelle, couleur: undefined, ...c })),
  ].sort((a, b) => (b.valeur ?? -1) - (a.valeur ?? -1))
  const lecture = actif === null ? '' : `${points[actif].libelle} : ${lignesBulle
    .map((l) => `${l.libelle} ${l.valeur === null ? 'sans objet' : formatPourcent(l.valeur)}`).join(', ')}`

  return (
    <div
      ref={conteneur} className="courbes" tabIndex={0} role="group"
      aria-label={`${libelle}. Flèches gauche et droite pour parcourir les scrutins.`}
      onPointerEnter={() => setIci(true)}
      onPointerMove={(e) => onActif(plusProche(e))}
      onPointerDown={(e) => { setIci(true); onActif(plusProche(e)) }}
      onPointerLeave={(e) => { setIci(false); if (e.pointerType === 'mouse') onActif(null) }}
      onFocus={(e) => {
        setIci(true)
        // Au clavier, le réticule part du scrutin affiché ; à la souris, du point visé.
        if (actif === null && e.currentTarget.matches(':focus-visible')) onActif(courant ?? n - 1)
      }}
      onBlur={() => { setIci(false); onActif(null) }}
      onKeyDown={clavier}
    >
      <svg width={largeur} height={MARGE.haut + hauteur + MARGE.bas} aria-hidden="true">
        {reperes.map((v) => (
          <g key={v}>
            <line x1={MARGE.gauche} x2={largeur - MARGE.droite} y1={y(v)} y2={y(v)} className={v === 0 ? 'base' : 'repere'} />
            <text x={MARGE.gauche - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">{v} %</text>
          </g>
        ))}
        {courant !== undefined && <line x1={x(courant)} x2={x(courant)} y1={MARGE.haut} y2={MARGE.haut + hauteur} className="courant" />}
        {annees.map((i) => (
          <text key={i} x={x(i)} y={MARGE.haut + hauteur + 17} textAnchor="middle" className={i === courant ? 'annee-courante' : undefined}>
            {points[i].annee}
          </text>
        ))}
        {actif !== null && <line x1={x(actif)} x2={x(actif)} y1={MARGE.haut} y2={MARGE.haut + hauteur} className="reticule" />}
        {series.map((s) => {
          const derniere = s.valeurs.findLastIndex((v) => v !== null)
          const pointsIsoles = s.valeurs.flatMap((v, i) =>
            v !== null && (s.valeurs[i - 1] ?? null) === null && (s.valeurs[i + 1] ?? null) === null && i !== derniere ? [i] : [])
          return (
            <g key={s.cle}>
              <path d={trace(s.valeurs, x, y)} fill="none" stroke={s.couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {[...pointsIsoles, ...(derniere >= 0 && derniere !== actif ? [derniere] : [])].map((i) => (
                <circle key={i} cx={x(i)} cy={y(s.valeurs[i] ?? 0)} r={4} fill={s.couleur} className="anneau" />
              ))}
              {actif !== null && s.valeurs[actif] !== null && (
                <circle cx={x(actif)} cy={y(s.valeurs[actif] ?? 0)} r={4.5} fill={s.couleur} className="anneau" />
              )}
            </g>
          )
        })}
      </svg>
      {ici && actif !== null && (
        <div
          className="bulle-courbe" aria-hidden="true"
          style={x(actif) > largeur / 2 ? { right: largeur - x(actif) + 10 } : { left: x(actif) + 10 }}
        >
          <p className="bulle-titre">{points[actif].libelle}</p>
          <ul>
            {lignesBulle.map((l) => (
              <li key={l.cle}>
                {l.couleur ? <span className="cle-ligne" style={{ background: l.couleur }} /> : <span className="cle-ligne vide" />}
                <strong>{l.valeur === null ? '—' : formatPourcent(l.valeur)}</strong>
                <span>{l.libelle}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="visuellement-cache" aria-live="polite">{ici ? lecture : ''}</p>
    </div>
  )
}
