import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pencil, Star } from 'lucide-react'
import type { Category, Tea } from './data'
import { usePageTurn } from './usePageTurn'

export function Cover({ index, className = '' }: { index: number; className?: string }) {
  return <div aria-hidden="true" className={`cover cover-${index} ${className}`} />
}

const date = (value: string) => new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value))
const hintKey = 'tea-collection-swipe-hint'
let hintDismissed = false
function shouldShowHint() {
  if (hintDismissed) return false
  try { return localStorage.getItem(hintKey) !== '1' } catch { return true }
}

function PageFaces({ tea, category, flipped, number }: { tea: Tea; category: Category; flipped: boolean; number: string }) {
  return <span className={`flip ${flipped ? 'flipped' : ''}`}>
    <span className="face front" aria-hidden={flipped}>
      {tea.photo ? <img src={tea.photo} alt={tea.name} draggable={false} decoding="async" /> : <span className={`cover cover-${category.cover}`} />}
      <span className="sheet-caption">
        <span className="sheet-title">{tea.name}</span>
        <span className="page-number">{number}</span>
      </span>
    </span>
    <span className="face back" aria-hidden={!flipped}>
      <span className="eyebrow">{category.name}</span>
      <span className="sheet-title">{tea.name}</span>
      <span className="date">Добавлено {date(tea.added)}</span>
      {tea.tasted && <span className="date">Дегустация {date(tea.tasted)}</span>}
      <span className="notes">{tea.notes || 'Пока без заметок 🍃'}</span>
      {tea.rating > 0 && <span className="stars" aria-label={`Оценка ${tea.rating} из 5`}>
        {Array.from({ length: tea.rating }, (_, i) => <Star key={i} size={18} fill="currentColor" />)}
      </span>}
      <span className="page-number back-number">{number}</span>
    </span>
  </span>
}

export function Album({ category, teas, index, change, edit }: {
  category: Category; teas: Tea[]; index: number; change: (index: number) => void; edit: (tea: Tea) => void
}) {
  const tea = teas[index]
  const [turned, setTurned] = useState<string | null>(null)
  const [hint, setHint] = useState(shouldShowHint)
  const restoreFocus = useRef(false)
  const currentButton = useRef<HTMLButtonElement>(null)
  function flipPage() { setTurned(value => value === tea.id ? null : tea.id) }
  const { book, requestTurn, settling, suppressTap, handlers } = usePageTurn(tea.id, index, teas.length, next => {
    restoreFocus.current = document.activeElement === currentButton.current
    setTurned(null)
    if (hint) {
      hintDismissed = true
      try { localStorage.setItem(hintKey, '1') } catch { /* The hint stays hidden for this session. */ }
      setHint(false)
    }
    change(next)
  }, flipPage)

  useLayoutEffect(() => {
    if (restoreFocus.current) currentButton.current?.focus({ preventScroll: true })
    restoreFocus.current = false
  }, [tea.id])

  useEffect(() => {
    // Prepare the neighboring photos before the gesture instead of mounting them mid-turn.
    book.current?.querySelectorAll('img').forEach(image => { void image.decode().catch(() => {}) })
  }, [book, teas, tea.id])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (document.querySelector('dialog[open]') || (event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return
      event.preventDefault()
      requestTurn(event.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestTurn])

  const first = Math.max(0, index - 1)
  return <section className="album" aria-label="Страницы альбома">
    <div ref={book} className="book" {...handlers}>
      {teas.slice(first, index + 2).map((item, offset) => {
        const position = first + offset
        const active = position === index
        const flipped = active && turned === item.id
        return <div key={item.id} className="sheet" data-position={active ? 'current' : position < index ? 'previous' : 'next'}
          inert={!active} aria-hidden={!active}>
          <button ref={active ? currentButton : undefined} className="flip-target" type="button"
            aria-label={flipped ? 'Показать фотографию' : 'Показать заметки'} aria-pressed={flipped}
            onClick={event => {
              const fromTouch = (event.nativeEvent as PointerEvent).pointerType === 'touch'
              if (active && !fromTouch && !settling.current && (event.detail === 0 || !suppressTap.current)) flipPage()
            }}>
            <PageFaces tea={item} category={category} flipped={flipped} number={`${position + 1} / ${teas.length}`} />
          </button>
          <button className="icon sheet-edit" type="button" aria-label="Редактировать чай"
            onClick={() => { if (active && !settling.current) edit(item) }}><Pencil size={16} /></button>
        </div>
      })}
      <div className="page-shadow" aria-hidden="true" />
      {hint && teas.length > 1 && <p className="swipe-hint">Листай страницы свайпом 🍃</p>}
    </div>
    <output className="sr-only" aria-live="polite">{index + 1} / {teas.length}</output>
  </section>
}
