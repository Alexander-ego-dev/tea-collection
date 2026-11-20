import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Star, Trash2, X } from 'lucide-react'
import { today, type Category, type Tea } from './data'
import { PhotoField } from './PhotoField'

export function Dialog({ title, close, children, busy = false }: { title: string; close: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <div className="dialog-header"><h2 id="dialog-title">{title}</h2>
      <button className="icon" aria-label="Закрыть" disabled={busy} onClick={close}><X size={21} /></button>
    </div>
    {children}
  </dialog>
}

export function TeaEditor({ tea, category, categories, close, save, remove, busy, failure }: {
  tea?: Tea; category: string; categories: Category[]; busy: boolean; failure: string; close: () => void
  save: (tea: Tea) => void; remove: (tea: Tea) => void
}) {
  const [photo, setPhoto] = useState({ photo: tea?.photo ?? '', sourcePhoto: tea?.sourcePhoto ?? '' })
  const [rating, setRating] = useState(tea?.rating ?? 0)
  const [notes, setNotes] = useState(tea?.notes ?? '')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const legacyLong = !!tea && tea.notes.length > 150 && notes === tea.notes
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || processing) return
    const values = new FormData(event.currentTarget)
    const name = String(values.get('name')).trim()
    if (!name) return
    if (!photo.photo) { setError('Выберите фотографию и подтвердите кадрирование.'); return }
    if (!rating) { setError('Выберите оценку от 1 до 5.'); return }
    if (notes.length > 150 && !legacyLong) { setError('Описание должно содержать не более 150 символов.'); return }
    save({
      id: tea?.id ?? crypto.randomUUID(), name, category: String(values.get('category')),
      ...photo, notes: legacyLong ? notes : notes.trim(), rating, tasted: tea?.tasted ?? today(), added: tea?.added ?? today(),
    })
  }
  return <Dialog title={tea ? 'Редактировать чай' : 'Новый чай'} close={close} busy={busy || processing}>
    <form onSubmit={submit}>
      <label>Название чая<input name="name" required maxLength={120} defaultValue={tea?.name} placeholder="Например, Curtis Blue Berries" /></label>
      <PhotoField value={photo} change={setPhoto} busy={busy} label="Выбрать фотографию" processing={setProcessing} />
      <label>Коллекция<select name="category" defaultValue={tea?.category ?? category}>
        {categories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>
      <label>Описание<textarea aria-label="Описание" name="notes" rows={3} maxLength={legacyLong ? 6000 : 150} value={notes}
        onChange={event => setNotes(event.target.value)} /></label>
      <p className="field-counter" aria-live="polite">{notes.length} / 150</p>
      {legacyLong && <p className="muted">Старая заметка сохранена полностью. Новое описание — до 150 символов.</p>}
      <fieldset><legend>Оценка</legend><div className="stars">
        {[1, 2, 3, 4, 5].map(value => <button type="button" key={value} className="icon" aria-label={`Оценка ${value} из 5`}
          aria-pressed={value === rating} onClick={() => setRating(value)}>
          <Star size={23} fill={value <= rating ? 'currentColor' : 'none'} />
        </button>)}
      </div></fieldset>
      {(failure || error) && <p className="error" role="alert">{failure || error}</p>}
      <button className="primary" disabled={busy || processing}>{busy ? 'Сохраняем…' : tea ? 'Сохранить изменения' : 'Добавить в коллекцию'}</button>
      {tea && <button type="button" className="danger text-button" disabled={busy || processing} onClick={() => remove(tea)}><Trash2 size={17} /> Удалить чай</button>}
    </form>
  </Dialog>
}

export function CategoryEditor({ category, close, save, remove, busy, failure }: {
  category?: Category; close: () => void; save: (name: string, photo: { photo: string; sourcePhoto: string }) => void
  remove: (category: Category) => void; busy: boolean; failure: string
}) {
  const [photo, setPhoto] = useState({ photo: category?.photo ?? '', sourcePhoto: category?.sourcePhoto ?? '' })
  const [processing, setProcessing] = useState(false)
  return <Dialog title={category ? 'Редактировать коллекцию' : 'Новая коллекция'} close={close} busy={busy || processing}>
    <form onSubmit={event => {
      event.preventDefault()
      if (busy || processing) return
      const name = String(new FormData(event.currentTarget).get('name')).trim()
      if (name) save(name, photo)
    }}>
      <label>Название коллекции<input name="name" required maxLength={80} defaultValue={category?.name} /></label>
      <PhotoField value={photo} change={setPhoto} busy={busy} label="Фотография обложки" processing={setProcessing} />
      {failure && <p className="error" role="alert">{failure}</p>}
      <button className="primary" disabled={busy || processing}>{category ? 'Сохранить коллекцию' : 'Создать коллекцию'}</button>
      {category && <button type="button" className="danger text-button" disabled={busy || processing}
        onClick={() => remove(category)}><Trash2 size={17} /> Удалить коллекцию</button>}
    </form>
  </Dialog>
}
