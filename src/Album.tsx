import { useRef, useState, type PointerEvent } from 'react'
import { ArrowLeft, ArrowRight, Pencil, RotateCcw, Star } from 'lucide-react'
import type { Category, Tea } from './data'

export function Cover({ index, className = '' }: { index: number; className?: string }) {
  return <div aria-hidden="true" className={`cover cover-${index} ${className}`} />
}

const date = (value: string) => new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value))
type Gesture = { x: number; y: number; id: number; axis?: 'horizontal' | 'vertical' }
type TurningPage = { tea: Tea; flipped: boolean; direction: number }

function PageFaces({ tea, category, flipped }: { tea: Tea; category: Category; flipped: boolean }) {
  return <span className={`flip ${flipped ? 'flipped' : ''}`}>
    <span className="face front" aria-hidden={flipped}>
      {tea.photo ? <img src={tea.photo} alt={tea.name} draggable={false} /> : <span className={`cover cover-${category.cover}`} />}
      <span className="polaroid-title">{tea.name}</span>
      <span className="caption"><RotateCcw size={13} /> Мои впечатления</span>
    </span>
    <span className="face back" aria-hidden={!flipped}>
      <span className="eyebrow">{category.name}</span>
      <span className="polaroid-title">{tea.name}</span>
      <span className="date">Добавлено {date(tea.added)}</span>
      {tea.tasted && <span className="date">Дегустация {date(tea.tasted)}</span>}
      <span className="notes">{tea.notes || 'Пока без заметок 🍃'}</span>
      {tea.rating > 0 && <span className="stars" aria-label={`Оценка ${tea.rating} из 5`}>
        {Array.from({ length: tea.rating }, (_, i) => <Star key={i} size={18} fill="currentColor" />)}
      </span>}
    </span>
  </span>
}

export function Album({ category, teas, index, change, edit }: {
  category: Category; teas: Tea[]; index: number; change: (index: number) => void; edit: (tea: Tea) => void
}) {
  const tea = teas[index]
  const [turned, setTurned] = useState<string | null>(null)
  const [turning, setTurning] = useState<TurningPage | null>(null)
  const origin = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const flipped = turned === tea.id

  function turnPage(delta: number) {
    const next = index + delta
    if (turning || next < 0 || next >= teas.length) return
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setTurning({ tea, flipped, direction: delta })
    setTurned(null)
    change(next)
  }

  function start(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return
    suppressClick.current = !!turning
    origin.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }

  function move(event: PointerEvent) {
    const point = origin.current
    if (!point || point.id !== event.pointerId || point.axis) return
    const dx = Math.abs(event.clientX - point.x)
    const dy = Math.abs(event.clientY - point.y)
    if (Math.hypot(dx, dy) <= 12) return
    suppressClick.current = true
    point.axis = dx > dy * 1.5 ? 'horizontal' : 'vertical'
    if (point.axis === 'horizontal') event.currentTarget.setPointerCapture(event.pointerId)
  }

  function end(event: PointerEvent) {
    const point = origin.current
    if (!point || point.id !== event.pointerId) return
    origin.current = null
    const dx = event.clientX - point.x
    const dy = event.clientY - point.y
    if (Math.hypot(dx, dy) > 12) suppressClick.current = true
    if (point.axis !== 'vertical' && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      turnPage(dx < 0 ? 1 : -1)
    }
  }

  function cancel(event: PointerEvent) {
    if (origin.current?.id !== event.pointerId) return
    origin.current = null
    suppressClick.current = true
  }

  return <section className="album" aria-label="Страницы альбома">
    <div className="book" onPointerDown={start} onPointerMove={move} onPointerUp={end}
      onPointerCancel={cancel} onLostPointerCapture={event => { if (event.target === event.currentTarget) cancel(event) }}>
      <button key={tea.id} className="flip-target" aria-label={flipped ? 'Показать фотографию' : 'Показать заметки'} aria-pressed={flipped}
        onClick={event => {
          if (!turning && (event.detail === 0 || !suppressClick.current)) setTurned(flipped ? null : tea.id)
        }}>
        <PageFaces tea={tea} category={category} flipped={flipped} />
      </button>
      {turning && <>
        <div className={`page-shadow ${turning.direction < 0 ? 'reverse' : ''}`} aria-hidden="true" />
        <div className={`turning-page ${turning.direction < 0 ? 'reverse' : ''}`} aria-hidden="true"
          onAnimationEnd={event => { if (event.target === event.currentTarget) setTurning(null) }}>
          <PageFaces tea={turning.tea} category={category} flipped={turning.flipped} />
        </div>
      </>}
    </div>
    <div className="page-details"><span>Добавлено {date(tea.added)}</span>
      <button className="icon" aria-label="Редактировать чай" onClick={() => edit(tea)}><Pencil size={17} /></button>
    </div>
    <nav className="pagination" aria-label="Перелистывание">
      <button className="icon ring" aria-label="Предыдущая страница" disabled={index === 0} onClick={() => turnPage(-1)}><ArrowLeft size={19} /></button>
      <span aria-live="polite">{index + 1} / {teas.length}</span>
      <button className="icon ring" aria-label="Следующая страница" disabled={index >= teas.length - 1} onClick={() => turnPage(1)}><ArrowRight size={19} /></button>
    </nav>
  </section>
}
