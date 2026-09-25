/** Chevron des éléments repliables : vers le bas quand l'élément est ouvert, vers la droite quand il est replié. */
export function Chevron({ ouvert }: { ouvert: boolean }) {
  return (
    <svg className="chevron" data-ouvert={ouvert} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
