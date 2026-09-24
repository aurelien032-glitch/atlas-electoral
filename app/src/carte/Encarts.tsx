import { useId, type PointerEvent } from 'react'
import { estArrondissement } from '../donnees/territoires'
import type { Encart } from '../donnees/types'
import type { Coloriage } from '../modes'
import type { Selection } from '../vue'
import type { Survol } from './Carte'
import { FOND_CARTE, TRAIT_HACHURES } from './couleurs'

interface Props {
  encarts: readonly Encart[]
  coloriage: Coloriage | null
  /** Législatives : la vue nationale colore les circonscriptions, les encarts aussi. */
  parCirconscription: boolean
  onSurvol: (survol: Survol | null) => void
  onChoisir: (selection: Selection) => void
  onCadrer: (emprise: [number, number, number, number]) => void
}

/**
 * Petites cartes de Paris et de la petite couronne, et des départements d'outre-mer, posées sur la vue
 * nationale : mêmes couleurs, même infobulle et même clic que la carte principale. Leur nom recadre la
 * carte sur le territoire. Chemins SVG précalculés par le pipeline (geo/encarts.json).
 */
export function Encarts({ encarts, coloriage, parCirconscription, onSurvol, onChoisir, onCadrer }: Props) {
  const motif = useId()
  // Paris figure par arrondissements, comme sur la carte principale.
  const niveauDe = (code: string) => parCirconscription ? 'circonscription' : estArrondissement(code) ? 'arrondissement' : 'commune'
  const etatDe = (code: string) => parCirconscription ? coloriage?.circonscriptions?.get(code)
    : estArrondissement(code) ? coloriage?.arrondissements?.get(code) : coloriage?.communes.get(code)
  const survoler = (e: PointerEvent<SVGPathElement>, code: string) => {
    const zone = e.currentTarget.closest('.zone-carte-fond')?.getBoundingClientRect()
    if (zone) onSurvol({ niveau: niveauDe(code), code, x: e.clientX - zone.left, y: e.clientY - zone.top, largeur: zone.width })
  }
  return (
    <div className="encarts" role="group" aria-label="Encarts : Paris et petite couronne, outre-mer">
      {encarts.map((encart) => (
        <figure key={encart.code}>
          <svg width={encart.largeur} height={encart.hauteur} viewBox={`0 0 ${encart.largeur} ${encart.hauteur}`} aria-hidden="true">
            <defs>
              <pattern id={`${motif}-${encart.code}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill={FOND_CARTE} />
                <line x1="0" y1="0" x2="0" y2="5" stroke={TRAIT_HACHURES} strokeWidth="1.4" />
              </pattern>
            </defs>
            {Object.entries(parCirconscription ? encart.circonscriptions : encart.communes).map(([code, d]) => {
              const etat = etatDe(code)
              return (
                <path
                  key={code} d={d} className="forme"
                  fill={!etat ? FOND_CARTE : etat.hachure ? `url(#${motif}-${encart.code})` : etat.couleur}
                  fillOpacity={etat && !etat.hachure ? etat.opacite : 1}
                  onPointerMove={(e) => survoler(e, code)}
                  onPointerLeave={() => onSurvol(null)}
                  onClick={() => { onSurvol(null); onChoisir({ niveau: niveauDe(code), code }) }}
                />
              )
            })}
          </svg>
          <figcaption>
            <button type="button" className="lien" onClick={() => onCadrer(encart.emprise)}>{encart.nom}</button>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
