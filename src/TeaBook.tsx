import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import type { Category, Collection } from './data'
import './tea-book.css'

export function TeaBook({ collection, open, setOpen, add, edit, countLabel, scroll }: {
  collection: Collection; open: boolean; setOpen: (open: boolean) => void
  add: () => void; edit: (category: Category) => void; countLabel: (count: number) => string; scroll: RefObject<number>
}) {
  const lid = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const focus = useRef(false)
  function toggle(next: boolean, keyboard: boolean) { focus.current = keyboard; if (!next) scroll.current = 0; setOpen(next) }
  useLayoutEffect(() => {
    if (open && content.current) content.current.scrollTop = scroll.current
  }, [open, scroll])
  useEffect(() => {
    if (!focus.current) return
    focus.current = false
    const button = open ? close.current : lid.current
    button?.focus({ preventScroll: true })
  }, [open])
  return <section className="tea-book" data-open={open} aria-label="Моя чайная коллекция">
    <div className="book-page">
      <div className="book-page-content" ref={content} onScroll={event => { if (open) scroll.current = event.currentTarget.scrollTop }}
        inert={!open} aria-hidden={!open}>
        <header className="book-page-header">
          <button ref={close} type="button" className="page-icon" aria-label="Закрыть книгу"
            onClick={event => toggle(false, event.detail === 0)}><ArrowLeft size={19} strokeWidth={1.2} /></button>
          <div><h1>Моя коллекция</h1><p>Личный чайный архив</p></div>
          <button className="page-icon" type="button" aria-label="Новая коллекция" onClick={add}><Plus size={22} strokeWidth={1.2} /></button>
        </header>
        <div className="brand-grid">
          {collection.categories.map(item => <article className="brand-card" key={item.id}>
            <a href={'#/album/' + encodeURIComponent(item.id)}>
              {item.photo ? <img src={item.photo} alt={item.name} decoding="async" loading="lazy" /> :
                <span className="brand-placeholder"><strong>{item.name}</strong><span>Чайная коллекция</span></span>}
              <span className="brand-count">{countLabel(collection.teas.filter(tea => tea.category === item.id).length)}</span>
            </a>
            <button type="button" className="brand-edit" aria-label={`Редактировать коллекцию — ${item.name}`} onClick={() => edit(item)}>
              <Pencil size={12} strokeWidth={1.3} />
            </button>
          </article>)}
          <button className="brand-card new-brand" type="button" onClick={add}><Plus size={22} strokeWidth={1.1} /><span>Новая коллекция</span></button>
        </div>
      </div>
    </div>
    <button className="book-cover" ref={lid} type="button" aria-label="Открыть книгу" inert={open} aria-hidden={open}
      onClick={event => toggle(true, event.detail === 0)}>
      <span className="book-cover-front">
        <span className="book-emboss"><strong>Tea Collection</strong><i /><span>Моя чайная коллекция</span></span>
      </span>
      <span className="book-cover-back" aria-hidden="true" />
    </button>
    {!open && <p className="book-instruction">Нажми, чтобы открыть</p>}
  </section>
}
