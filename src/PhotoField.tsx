import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Camera, Crop, X } from 'lucide-react'
import { decodeImage, errorMessage, optimizePhoto } from './data'

type PhotoValue = { photo: string; sourcePhoto: string }
export function PhotoField({ value, change, busy, label = 'Фотография', processing }: {
  value: PhotoValue; change: (value: PhotoValue) => void; busy: boolean
  label?: string; processing: (active: boolean) => void
}) {
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState('')
  async function choose(file?: File) {
    if (!file) return
    setFailure('')
    setLoading(true)
    processing(true)
    try { setSource(await optimizePhoto(file)) }
    catch (error) { setFailure(errorMessage(error)); processing(false) }
    finally { setLoading(false) }
  }
  function closeCrop() { setSource(''); processing(false) }
  return <div className="photo-field">
    <label className="photo-picker">
      {value.photo ? <img src={value.photo} alt="Выбранная фотография" /> : <Camera size={22} strokeWidth={1.4} />}
      <span>{loading ? 'Подготавливаем фото…' : value.photo ? 'Заменить фотографию' : label}</span>
      <input aria-label={label} type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
        disabled={busy || loading || !!source} onChange={event => { void choose(event.target.files?.[0]); event.target.value = '' }} />
    </label>
    {value.photo && <div className="photo-field-actions">
      <button type="button" className="text-button" disabled={busy || loading || !!source}
        onClick={() => { setSource(value.sourcePhoto || value.photo); processing(true) }}><Crop size={15} /> Кадрирование</button>
      <button type="button" className="text-button" disabled={busy || loading || !!source}
        onClick={() => change({ photo: '', sourcePhoto: '' })}>Убрать фотографию</button>
    </div>}
    {failure && <p role="alert" className="error">{failure}</p>}
    {source && <SquareCrop source={source} close={closeCrop} confirm={photo => {
      change({ photo, sourcePhoto: source }); closeCrop()
    }} />}
  </div>
}

function SquareCrop({ source, close, confirm }: { source: string; close: () => void; confirm: (photo: string) => void }) {
  const [image, setImage] = useState<HTMLImageElement>()
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [failure, setFailure] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const active = useRef<{ id: number; x: number; y: number; fromX: number; fromY: number } | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let live = true
    cancelButton.current?.focus()
    void decodeImage(source).then(image => { if (live) setImage(image) },
      error => { if (live) setFailure(errorMessage(error)) })
    return () => { live = false }
  }, [source])
  useEffect(() => {
    if (!image || !canvas.current) return
    const context = canvas.current.getContext('2d')
    if (!context) { setFailure('Не удалось подготовить кадрирование.'); return }
    const size = 1080
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * zoom
    const w = image.naturalWidth * scale
    const h = image.naturalHeight * scale
    context.fillStyle = '#f7f3eb'
    context.fillRect(0, 0, size, size)
    context.drawImage(image, -(w - size) / 2 * (x + 1), -(h - size) / 2 * (y + 1), w, h)
  }, [image, zoom, x, y])

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const start = active.current
    if (start?.id !== event.pointerId || !image) return
    const side = event.currentTarget.clientWidth
    const scale = Math.max(side / image.naturalWidth, side / image.naturalHeight) * zoom
    const overflowX = image.naturalWidth * scale - side
    const overflowY = image.naturalHeight * scale - side
    const clamp = (value: number) => Math.max(-1, Math.min(1, value))
    if (overflowX > 0) setX(clamp(start.fromX - (event.clientX - start.x) * 2 / overflowX))
    if (overflowY > 0) setY(clamp(start.fromY - (event.clientY - start.y) * 2 / overflowY))
  }
  return <section className="crop-overlay" aria-label="Квадратное кадрирование" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  }}>
    <div className="crop-heading"><h3>Квадратное кадрирование</h3>
      <button ref={cancelButton} type="button" className="icon" aria-label="Отменить кадрирование" onClick={close}><X size={20} /></button></div>
    <p>Переместите фото и выберите масштаб.</p>
    <canvas ref={canvas} width={1080} height={1080} aria-label="Область кадрирования"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return
        active.current = { id: event.pointerId, x: event.clientX, y: event.clientY, fromX: x, fromY: y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }} onPointerMove={move} onPointerUp={() => { active.current = null }}
      onPointerCancel={() => { active.current = null }} onLostPointerCapture={() => { active.current = null }} />
    <label>Масштаб<input type="range" min="1" max="3" step=".01" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
    <label>По горизонтали<input type="range" min="-1" max="1" step=".01" value={x} onChange={event => setX(Number(event.target.value))} /></label>
    <label>По вертикали<input type="range" min="-1" max="1" step=".01" value={y} onChange={event => setY(Number(event.target.value))} /></label>
    {failure && <p className="error" role="alert">{failure}</p>}
    <button type="button" className="primary" disabled={!image || !!failure} onClick={() => {
      try {
        const photo = canvas.current?.toDataURL('image/jpeg', .86)
        if (!photo?.startsWith('data:image/jpeg')) throw new Error('Не удалось сохранить кадрирование.')
        confirm(photo)
      } catch (error) { setFailure(errorMessage(error)) }
    }}>Использовать фото</button>
  </section>
}
