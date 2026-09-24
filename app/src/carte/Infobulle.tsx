interface Props {
  x: number
  y: number
  /** Largeur de la zone de carte : l'infobulle passe à gauche du pointeur près du bord droit. */
  largeur: number
  titre: string
  lignes: string[]
}

/** Infobulle de survol (souris seulement : au toucher, un appui sélectionne le territoire). */
export function Infobulle({ x, y, largeur, titre, lignes }: Props) {
  const aGauche = x > largeur - 280
  return (
    <div className="infobulle" role="status" style={{ left: x, top: y, transform: `translate(${aGauche ? 'calc(-100% - 14px)' : '14px'}, 14px)` }}>
      <div className="infobulle-titre">{titre}</div>
      {lignes.map((l) => <div key={l}>{l}</div>)}
    </div>
  )
}
