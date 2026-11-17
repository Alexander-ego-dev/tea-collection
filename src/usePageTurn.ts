import { useLayoutEffect, useRef, type PointerEvent } from 'react'

type Direction = -1 | 1
type Contact = {
  id: number; x: number; y: number; width: number
  lastX: number; lastTime: number; speed: number; tap: boolean
  axis?: 'horizontal' | 'vertical'
}

const perspective = 1200
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

function sheetAngle(distance: number, width: number) {
  // Project the free edge onto the screen so it travels with the finger.
  const target = .5 - distance / width
  const ratio = width / perspective
  let low = 0
  let high = Math.PI / 2 + Math.atan(ratio / 2)
  for (let step = 0; step < 14; step++) {
    const angle = (low + high) / 2
    const edge = (Math.cos(angle) - .5) / (1 + ratio * Math.sin(angle))
    if (edge > target) low = angle
    else high = angle
  }
  return (low + high) * 90 / Math.PI
}

export function usePageTurn(pageId: string, index: number, total: number, change: (index: number) => void, tap: () => void) {
  const book = useRef<HTMLDivElement>(null)
  const contact = useRef<Contact | null>(null)
  const frame = useRef(0)
  const settling = useRef(false)
  const suppressTap = useRef(false)
  const wanted = useRef(0)
  const painted = useRef(0)

  function paint(angle: number) {
    const node = book.current
    if (!node) return
    if (Math.sign(angle) !== Math.sign(painted.current)) {
      if (angle) node.dataset.reveal = angle > 0 ? 'next' : 'previous'
      else delete node.dataset.reveal
    }
    painted.current = angle
    node.style.setProperty('--sheet-angle', angle ? angle + 'deg' : '0deg')
    const shade = Math.sin(Math.min(1, Math.abs(angle) / 90) * Math.PI)
    node.style.setProperty('--sheet-shade', String(shade))
  }

  useLayoutEffect(() => {
    paint(0)
    settling.current = false
    contact.current = null
    return () => { cancelAnimationFrame(frame.current); frame.current = 0 }
  }, [pageId])

  function allowed(direction: number): direction is Direction {
    return direction !== 0 && index + direction >= 0 && index + direction < total
  }

  function settle(direction: Direction | 0, width: number, speed = 0) {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    settling.current = true
    const from = painted.current
    const finish = () => {
      if (direction) {
        change(index + direction)
      } else {
        paint(0)
        settling.current = false
      }
    }
    if (reduced.matches || (!direction && !from)) { finish(); return }
    const edgeOn = 90 + Math.atan(width / (2 * perspective)) * 180 / Math.PI
    const to = direction * edgeOn
    const duration = Math.max(140, Math.min(385, 145 + Math.abs(to - from) * 2.1 - Math.abs(speed) * 36))
    let start: number | undefined
    // Ease from the last painted frame, including if pointerup arrives before the next frame.
    function tick(now: number) {
      start ??= now
      const t = Math.min(1, (now - start) / duration)
      paint(from + (to - from) * (1 - (1 - t) ** 3))
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else { frame.current = 0; finish() }
    }
    frame.current = requestAnimationFrame(tick)
  }

  function requestTurn(direction: Direction) {
    if (!settling.current && !contact.current && allowed(direction) && book.current) {
      settle(direction, book.current.clientWidth)
    }
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return
    suppressTap.current = settling.current
    if (settling.current || contact.current || (event.target as HTMLElement).closest('button.sheet-edit')) return
    // Safari owns gestures started at the very edge of the display.
    if (event.pointerType === 'touch' && (event.clientX < 20 || event.clientX > document.documentElement.clientWidth - 20)) return
    const { clientX: x, clientY: y, pointerId: id, timeStamp } = event
    contact.current = {
      id, x, y, width: event.currentTarget.clientWidth, lastX: x, lastTime: timeStamp, speed: 0,
      tap: event.pointerType === 'touch' && !!(event.target as Element).closest('.flip-target'),
    }
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = contact.current
    if (point?.id !== event.pointerId || point.axis === 'vertical') return
    const dx = event.clientX - point.x
    const dy = event.clientY - point.y
    if (!point.axis) {
      if (Math.hypot(dx, dy) < 7) return
      suppressTap.current = true
      point.axis = Math.abs(dx) > Math.abs(dy) * 1.35 ? 'horizontal' : 'vertical'
      if (point.axis === 'vertical') return
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const elapsed = event.timeStamp - point.lastTime
    if (elapsed > 0) {
      point.speed = (event.clientX - point.lastX) / elapsed
      point.lastX = event.clientX
      point.lastTime = event.timeStamp
    }
    const direction = -Math.sign(dx)
    wanted.current = allowed(direction) && !reduced.matches ? dx : 0
    if (!frame.current) frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const distance = Math.min(Math.abs(wanted.current), point.width * .88)
      paint(distance > 0 ? -Math.sign(wanted.current) * sheetAngle(distance, point.width) : 0)
    })
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const point = contact.current
    if (point?.id !== event.pointerId) return
    contact.current = null
    const dx = event.clientX - point.x
    if (point.axis !== 'horizontal') {
      const shortTap = !point.axis && Math.hypot(dx, event.clientY - point.y) < 7
      if (!shortTap || point.tap) suppressTap.current = true
      if (shortTap && point.tap) tap()
      return
    }
    const distance = Math.abs(dx)
    const direction = -Math.sign(dx)
    const speed = event.timeStamp - point.lastTime < 85 ? point.speed : 0
    const passed = distance >= Math.max(52, point.width * .22)
    const flick = distance >= 32 && Math.sign(speed) === Math.sign(dx) && Math.abs(speed) > .55
    settle(allowed(direction) && (passed || flick) ? direction : 0, point.width, speed)
  }

  function pointerCancel(event: PointerEvent<HTMLDivElement>) {
    const point = contact.current
    if (point?.id !== event.pointerId) return
    contact.current = null
    suppressTap.current = true
    if (point.axis === 'horizontal') settle(0, point.width)
  }

  return { book, requestTurn, settling, suppressTap, handlers: {
    onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp,
    onPointerCancel: pointerCancel,
    onPointerLeave: (event: PointerEvent<HTMLDivElement>) => {
      if (contact.current?.axis !== 'horizontal') pointerCancel(event)
    },
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) pointerCancel(event)
    },
  } }
}
