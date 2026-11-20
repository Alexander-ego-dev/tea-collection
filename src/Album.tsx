import { useState } from 'react'
import { Pencil, Plus, Star } from 'lucide-react'
import type { Tea } from './data'
import './album-grid.css'

export function Album({ teas, edit, add }: { teas: Tea[]; edit: (tea: Tea) => void; add: () => void }) {
  const [turned, setTurned] = useState<Set<string>>(() => new Set())
  function flip(id: string) {
    setTurned(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const spaces = Math.max(0, 8 - teas.length)
  return <section className="package-album" aria-label="Фотоальбом">
    <div className="package-grid">
      {teas.map(tea => {
        const flipped = turned.has(tea.id)
        return <article className="package-slot" key={tea.id}>
          <button className="package-toggle" type="button"
            aria-label={`${flipped ? 'Показать фото' : 'Показать заметки'} — ${tea.name}`}
            aria-pressed={flipped} onClick={() => flip(tea.id)}>
            <span className={`package-flip ${flipped ? 'is-turned' : ''}`}>
              <span className="package-face package-front" aria-hidden={flipped}>
                {tea.photo ? <img src={tea.photo} alt={tea.name} loading="lazy" decoding="async" draggable={false} />
                  : <span className="missing-package">{tea.name}</span>}
              </span>
              <span className="package-face package-back" aria-hidden={!flipped}>
                <span className="package-name">{tea.name}</span>
                <span className="package-rating" aria-label={tea.rating ? `Оценка ${tea.rating} из 5` : 'Без оценки'}>
                  {[1, 2, 3, 4, 5].map(value => <Star size={12} key={value} fill={value <= tea.rating ? 'currentColor' : 'none'} strokeWidth={1.2} />)}
                </span>
                <span className="package-notes">{tea.notes || 'Пока без заметок'}</span>
              </span>
            </span>
          </button>
          <button className="package-edit" type="button" aria-label={`Редактировать чай — ${tea.name}`}
            onClick={() => edit(tea)}><Pencil size={13} strokeWidth={1.5} /></button>
        </article>
      })}
      {Array.from({ length: spaces }, (_, index) => index === 0 ?
        <button className="package-slot package-empty" key={'empty-' + index} type="button" onClick={add} aria-label="Добавить первый чай">
          <Plus size={25} strokeWidth={1} /><span className="sr-only">Добавить чай</span>
        </button> : <div className="package-slot package-empty" key={'empty-' + index} aria-hidden="true" />)}
    </div>
  </section>
}
