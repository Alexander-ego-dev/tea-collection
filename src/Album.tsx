import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pencil, Star } from 'lucide-react'
import type { Category, Tea } from './data'

export function Cover({ index, className = '' }: { index: number; className?: string }) {
  return <div aria-hidden="true" className={`cover cover-${index} ${className}`} />
}

const date = (value: string) => new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value))
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function PageFaces({ tea, category, flipped, number, flipBack }: {
  tea: Tea; category: Category; flipped: boolean; number: string; flipBack: () => void
}) {
  return <div className="sheet-display" onClick={flipped ? flipBack : undefined}>
    <div className={`flip ${flipped ? 'flipped' : ''}`}>
      <div className="face front" aria-hidden={flipped}>
        {tea.photo ? <img src={tea.photo} alt={tea.name} draggable={false} decoding="async" /> : <span className={`cover cover-${category.cover}`} />}
        <div className="sheet-caption">
          <span className="sheet-title">{tea.name}</span>
          <span className="page-number">{number}</span>
        </div>
      </div>
      <div className="face back" aria-hidden={!flipped}>
        <span className="eyebrow">{category.name}</span>
        <span className="sheet-title">{tea.name}</span>
        <span className="date">Добавлено {date(tea.added)}</span>
        {tea.tasted && <span className="date">Дегустация {date(tea.tasted)}</span>}
        <span className="notes">{tea.notes || 'Пока без заметок 🍃'}</span>
        {tea.rating > 0 && <span className="stars" aria-label={`Оценка ${tea.rating} из 5`}>
          {Array.from({ length: tea.rating }, (_, i) => <Star key={i} size={18} fill="currentColor" />)}
        </span>}
        <span className="page-number back-number">{number}</span>
      </div>
    </div>
  </div>
}

export function Album({ category, teas, index, change, edit }: {
  category: Category; teas: Tea[]; index: number; change: (index: number) => void; edit: (tea: Tea) => void
}) {
  const tea = teas[index]
  const [turned, setTurned] = useState<string | null>(null)
  const [fade, setFade] = useState<{ from: string; to: string; flipped: boolean } | null>(null)
  const locked = useRef(false)
  const book = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  const currentButton = useRef<HTMLButtonElement>(null)
  const fading = fade?.to === tea.id

  function finishFade() {
    locked.current = false
    setFade(null)
  }

  function requestPage(delta: number) {
    const next = teas[index + delta]
    if (!next || locked.current) return
    restoreFocus.current = !!book.current?.querySelector(':focus-visible')
    if (!reducedMotion.matches) {
      locked.current = true
      setFade({ from: tea.id, to: next.id, flipped: turned === tea.id })
    }
    setTurned(null)
    change(index + delta)
  }

  function flipPage() {
    if (!locked.current) setTurned(value => value === tea.id ? null : tea.id)
  }

  useLayoutEffect(() => {
    if (restoreFocus.current) currentButton.current?.focus({ preventScroll: true })
    restoreFocus.current = false
  }, [tea.id])

  useEffect(() => {
    if (!fade) return
    // Recover if the animation is cancelled, including a change to reduced motion.
    const timeout = setTimeout(finishFade, 260)
    return () => clearTimeout(timeout)
  }, [fade])

  useEffect(() => {
    book.current?.querySelectorAll('img').forEach(image => { void image.decode().catch(() => {}) })
  }, [teas, tea.id])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (document.querySelector('dialog[open]') || (event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')) return
      event.preventDefault()
      requestPage(event.key === 'ArrowRight' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestPage])

  const first = Math.max(0, index - 1)
  return <section className="album" aria-label="Страницы альбома">
    <div ref={book} className="book">
      {teas.slice(first, index + 2).map((item, offset) => {
        const position = first + offset
        const active = position === index
        const outgoing = fading && item.id === fade.from
        const flipped = active ? turned === item.id : outgoing && fade.flipped
        return <div key={item.id} className={`sheet ${active && fading ? 'sheet-enter' : ''}`}
          data-position={active ? 'current' : outgoing ? 'outgoing' : 'neighbor'}
          inert={!active} aria-hidden={!active}
          onAnimationEnd={event => {
            if (event.currentTarget === event.target && active && fading) finishFade()
          }}>
          <PageFaces tea={item} category={category} flipped={flipped} number={`${position + 1} / ${teas.length}`} flipBack={flipPage} />
          <div className={`photo-zones ${flipped ? 'notes-visible' : ''}`}>
            <button type="button" aria-label="Предыдущий чай" disabled={position === 0} onClick={() => requestPage(-1)} />
            <button ref={active ? currentButton : undefined} type="button"
              aria-label={flipped ? 'Показать фотографию' : 'Показать заметки'} aria-pressed={flipped} onClick={flipPage} />
            <button type="button" aria-label="Следующий чай" disabled={position === teas.length - 1} onClick={() => requestPage(1)} />
          </div>
          <button className="icon sheet-edit" type="button" aria-label="Редактировать чай"
            onClick={() => { if (active && !locked.current) edit(item) }}><Pencil size={16} /></button>
        </div>
      })}
    </div>
    <output className="sr-only" aria-live="polite">{index + 1} / {teas.length}</output>
  </section>
}
