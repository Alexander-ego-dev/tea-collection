import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { ArrowLeft, ArrowRight, Pencil, RotateCcw, Star } from 'lucide-react'
import type { Category, Tea } from './data'

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
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
type Gesture = {
  x: number; y: number; id: number; width: number
  lastX: number; lastTime: number; velocity: number
  axis?: 'horizontal' | 'vertical'; direction?: number
}
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
  const [direction, setDirection] = useState(0)
  const [hint, setHint] = useState(shouldShowHint)
  const origin = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)
  const animation = useRef<ReturnType<typeof animate> | null>(null)
  const progress = useMotionValue(0)
  const rotation = useTransform(progress, value => value * -88)
  const pageOpacity = useTransform(progress, value => 1 - Math.max(0, Math.abs(value) - .84) / .16)
  const pageLight = useTransform(progress, value => Math.min(1, Math.abs(value) * 1.55))
  const shadowOpacity = useTransform(progress, value => Math.sin(Math.abs(value) * Math.PI) * .66)
  const shadowWidth = useTransform(progress, value => 1 - Math.abs(value) * .86)
  const flipped = turned === tea.id
  const adjacent = direction ? teas[index + direction] : undefined

  useLayoutEffect(() => {
    progress.jump(0)
    return () => { animation.current?.stop(); animation.current = null }
  }, [tea.id, progress])

  function finish(delta: number) {
    animation.current = null
    setDirection(0)
    if (!delta) return
    setTurned(null)
    hintDismissed = true
    try { localStorage.setItem(hintKey, '1') } catch { /* The hint still stays hidden for this session. */ }
    setHint(false)
    change(index + delta)
  }

  function settle(delta: number, velocity = 0) {
    if (reducedMotion.matches) { finish(delta); return }
    const remaining = Math.abs(delta - progress.get())
    if (remaining < .001) { finish(delta); return }
    setDirection(delta || Math.sign(progress.get()))
    animation.current = animate(progress, delta, {
      duration: Math.min(.48, .16 + remaining * .27 / (1 + Math.abs(velocity) * .45)),
      ease: [0.22, 0.65, 0.25, 1],
      onComplete: () => finish(delta),
    })
  }

  function withinAlbum(delta: number) {
    return delta !== 0 && index + delta >= 0 && index + delta < teas.length
  }

  function turnPage(delta: number) {
    if (!animation.current && !origin.current && withinAlbum(delta)) settle(delta)
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || animation.current) return
    suppressClick.current = false
    const x = event.clientX
    origin.current = {
      x, y: event.clientY, id: event.pointerId, width: event.currentTarget.clientWidth,
      lastX: x, lastTime: event.timeStamp, velocity: 0,
    }
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const point = origin.current
    if (!point || point.id !== event.pointerId || point.axis === 'vertical') return
    const dx = event.clientX - point.x
    const dy = event.clientY - point.y
    if (!point.axis) {
      if (Math.hypot(dx, dy) < 10) return
      suppressClick.current = true
      point.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'horizontal' : 'vertical'
      if (point.axis === 'vertical') return
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const elapsed = event.timeStamp - point.lastTime
    if (elapsed > 0) {
      point.velocity = (event.clientX - point.lastX) / elapsed
      point.lastX = event.clientX
      point.lastTime = event.timeStamp
    }
    const delta = -Math.sign(dx)
    const available = withinAlbum(delta) && !reducedMotion.matches
    const nextDirection = available ? delta : 0
    if (point.direction !== nextDirection) {
      point.direction = nextDirection
      setDirection(nextDirection)
    }
    // Reserve the last part of the rotation for the release animation.
    progress.set(available ? delta * Math.min(.86, Math.abs(dx) / (point.width * .7)) : 0)
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const point = origin.current
    if (!point || point.id !== event.pointerId) return
    origin.current = null
    const dx = event.clientX - point.x
    const dy = event.clientY - point.y
    if (Math.hypot(dx, dy) < 10 && !point.axis) return
    suppressClick.current = true
    const delta = -Math.sign(dx)
    const velocity = event.timeStamp - point.lastTime < 80 ? point.velocity : 0
    const distance = Math.abs(dx)
    const crossed = distance >= Math.max(55, point.width * .23)
    const flick = distance >= 34 && Math.sign(velocity) === Math.sign(dx) && Math.abs(velocity) > .55
    const horizontal = point.axis === 'horizontal' || (!point.axis && Math.abs(dx) > Math.abs(dy) * 1.5)
    if (horizontal && withinAlbum(delta) && (crossed || flick)) settle(delta, velocity)
    else if (progress.get()) settle(0)
  }

  function cancel(event: PointerEvent<HTMLDivElement>) {
    if (origin.current?.id !== event.pointerId) return
    origin.current = null
    suppressClick.current = true
    if (progress.get()) settle(0)
  }

  return <section className="album" aria-label="Страницы альбома">
    <div className={`book ${direction < 0 ? 'reverse' : ''}`} onPointerDown={start} onPointerMove={move}
      onPointerUp={end} onPointerCancel={cancel} onPointerLeave={event => {
        if (origin.current?.axis !== 'horizontal') cancel(event)
      }} onLostPointerCapture={event => { if (event.target === event.currentTarget) cancel(event) }}>
      {adjacent && <>
        <div className="adjacent-page" aria-hidden="true"><PageFaces tea={adjacent} category={category} flipped={false} /></div>
        <motion.div className="page-shadow" style={{ opacity: shadowOpacity, scaleX: shadowWidth }} aria-hidden="true" />
      </>}
      <motion.button key={tea.id} className="flip-target" style={{ rotateY: direction ? rotation : 0, opacity: direction ? pageOpacity : 1 }}
        aria-label={flipped ? 'Показать фотографию' : 'Показать заметки'} aria-pressed={flipped}
        onClick={event => {
          if (!animation.current && (event.detail === 0 || !suppressClick.current)) setTurned(flipped ? null : tea.id)
        }}>
        <PageFaces tea={tea} category={category} flipped={flipped} />
        {adjacent && <motion.span className="page-light" style={{ opacity: pageLight }} aria-hidden="true" />}
      </motion.button>
    </div>
    <div className="page-details"><span>Добавлено {date(tea.added)}</span>
      <button className="icon" aria-label="Редактировать чай" onClick={() => edit(tea)}><Pencil size={17} /></button>
    </div>
    <nav className="pagination" aria-label="Перелистывание">
      <button className="icon ring" aria-label="Предыдущая страница" disabled={index === 0} onClick={() => turnPage(-1)}><ArrowLeft size={19} /></button>
      <span aria-live="polite">{index + 1} / {teas.length}</span>
      <button className="icon ring" aria-label="Следующая страница" disabled={index >= teas.length - 1} onClick={() => turnPage(1)}><ArrowRight size={19} /></button>
    </nav>
    {hint && teas.length > 1 && <p className="swipe-hint">Листай страницы свайпом 🍃</p>}
  </section>
}
