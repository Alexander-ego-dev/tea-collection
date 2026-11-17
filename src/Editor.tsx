import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Camera, Star, Trash2, X } from 'lucide-react'
import { errorMessage, optimizePhoto, today, type Category, type Tea } from './data'

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
  const [photo, setPhoto] = useState(tea?.photo ?? '')
  const [rating, setRating] = useState(tea?.rating ?? 0)
  const [loading, setLoading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  async function load(file?: File) {
    if (!file) return
    setLoading(true)
    setPhotoError('')
    try { setPhoto(await optimizePhoto(file)) }
    catch (error) { setPhotoError(errorMessage(error)) }
    finally { setLoading(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const name = String(values.get('name')).trim()
    if (!name || busy || loading) return
    save({
      id: tea?.id ?? crypto.randomUUID(), name, category: String(values.get('category')), photo,
      notes: String(values.get('notes')).trim(), rating, tasted: String(values.get('tasted') ?? ''), added: tea?.added ?? today(),
    })
  }
  return <Dialog title={tea ? 'Редактировать чай' : 'Новая страница'} close={close} busy={busy || loading}>
    <form onSubmit={submit}>
      <label>Название чая<input name="name" required maxLength={120} defaultValue={tea?.name} placeholder="Например, жасминовый улун" /></label>
      <label className="photo-picker">
        {photo ? <img src={photo} alt="Выбранная фотография" /> : <Camera size={24} />}
        <span>{loading ? 'Подготавливаем фото…' : photo ? 'Заменить фотографию' : 'Выбрать фотографию'}</span>
        <input type="file" accept="image/*,.heic,.heif" disabled={loading || busy} onChange={event => { void load(event.target.files?.[0]); event.target.value = '' }} />
      </label>
      {photo && <button className="text-button" type="button" disabled={loading || busy} onClick={() => setPhoto('')}>Убрать фотографию</button>}
      {photoError && <p className="error" role="alert">{photoError}</p>}
      <label>Категория<select name="category" defaultValue={tea?.category ?? category}>
        {categories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>
      <label>Мои впечатления<textarea name="notes" rows={3} maxLength={6000} defaultValue={tea?.notes} /></label>
      <fieldset><legend>Оценка</legend><div className="stars">
        {[1, 2, 3, 4, 5].map(value => <button type="button" key={value} className="icon" aria-label={`Оценка ${value} из 5`}
          aria-pressed={value <= rating} onClick={() => setRating(value === rating ? 0 : value)}>
          <Star size={23} fill={value <= rating ? 'currentColor' : 'none'} />
        </button>)}
      </div></fieldset>
      <label>Дата дегустации<input type="date" name="tasted" defaultValue={tea?.tasted ?? today()} /></label>
      {failure && <p className="error" role="alert">{failure}</p>}
      <button className="primary" disabled={busy || loading}>{busy ? 'Сохраняем…' : 'Сохранить в коллекцию'}</button>
      {tea && <button type="button" className="danger text-button" disabled={busy || loading} onClick={() => remove(tea)}><Trash2 size={17} /> Удалить чай</button>}
    </form>
  </Dialog>
}
