import type { Category } from './data'

const english = ['GREEN TEA', 'BLACK TEA', 'WHITE TEA', 'OOLONG', 'PU-ERH', 'HERBAL TEA']

export function archiveLabel(category: Category, position: number) {
  const name = category.id === 'tea-' + category.cover ? english[category.cover] : 'TEA ARCHIVE'
  return name + ' · COLLECTION Nº ' + String(position + 1).padStart(2, '0')
}

export function JournalDivider() {
  return <div className="journal-divider" aria-hidden="true">
    <svg viewBox="0 0 36 30" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round">
      <path d="M5 26C11 17 24 13 30 4C28 16 21 24 12 21C10 15 17 10 26 8L30 4" />
      <path d="M13 20L9 24" />
    </svg>
  </div>
}

export function JournalFrame() {
  return <svg className="journal-frame" viewBox="0 0 360 520" preserveAspectRatio="none" aria-hidden="true">
    <path d="M14 1H346Q349 12 359 16V504Q349 508 346 519H14Q11 508 1 504V16Q11 12 14 1Z"
      fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
  </svg>
}

export function BotanicalPlate({ type }: { type: number }) {
  const leaf = type === 2 ? 'M0 0Q2 -15 27 -23Q23 -5 0 0Z'
    : type === 5 ? 'M0 0Q2 -16 11 -16Q23 -23 32 -19Q21 -2 0 0Z'
    : 'M0 0Q10 -21 38 -22Q28 -3 0 0Z'
  return <svg className="botanical-plate" viewBox="0 0 150 155" fill="none" stroke="currentColor"
    strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M45 139Q76 102 90 29M63 113Q36 91 25 58M76 92Q107 85 120 59M83 64Q66 54 61 32" />
    {[[89,33,-41],[85,59,-23],[75,85,2],[65,108,12],[60,108,210],[41,91,196],[31,70,211],[78,62,219],[96,84,-19]].map(([x,y,a]) =>
      <g key={x+'-'+y} transform={`translate(${x} ${y}) rotate(${a})`}>
        <path d={leaf} />
        <path d={`M0 0Q10 -8 ${type === 2 ? 24 : 28} -18M9 -6L12 -12M15 -10L23 -9`} opacity=".65" />
      </g>)}
    {type === 5 && <path d="M115 68l10-14m-5 8q-7-8 1-9q-2-9 4-8q6-5 8 2q8 2 2 8q-4 7-10 1m3-9v5m-3-3h6" />}
    {type === 4 && <circle cx="78" cy="86" r="56" opacity=".43" />}
  </svg>
}
