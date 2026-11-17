import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { Cover } from './Album'
import type { Collection } from './data'
import './tea-chest.css'

export function TeaChest({ collection, open, setOpen, add, countLabel, scroll }: {
  collection: Collection; open: boolean; setOpen: (open: boolean) => void
  add: () => void; countLabel: (count: number) => string; scroll: RefObject<number>
}) {
  const lid = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const moveFocus = useRef(false)

  function toggle(next: boolean) {
    moveFocus.current = true
    if (!next) scroll.current = 0
    setOpen(next)
  }

  useLayoutEffect(() => {
    if (open && content.current) content.current.scrollTop = scroll.current
  }, [open, scroll])

  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    const control = open ? close.current : lid.current
    control?.focus({ preventScroll: true })
  }, [open])

  return <section className="tea-chest" data-open={open} aria-label="Моя чайная коллекция">
    <div className="chest-toolbar" inert={!open} aria-hidden={!open}>
      <button ref={close} type="button" className="chest-control" aria-label="Закрыть шкатулку" onClick={() => toggle(false)}>
        <ChevronDown size={17} /> Закрыть
      </button>
      <button type="button" className="chest-control" onClick={add}>
        <Plus size={17} /> Новая коллекция
      </button>
    </div>
    <div className="chest-stage">
      <div className="chest-body">
        <div className="chest-tray" ref={content} onScroll={event => { if (open) scroll.current = event.currentTarget.scrollTop }} inert={!open} aria-hidden={!open} aria-label="Отделения шкатулки">
          <div className="chest-compartments">
            {collection.categories.map(item => <a key={item.id} className="chest-cell" href={'#/album/' + encodeURIComponent(item.id)}>
              <Cover index={item.cover} className={item.id === 'tea-' + item.cover ? 'collection-photo' : undefined} />
              <span className="chest-label">
                <strong>{item.name}</strong>
                <small>{countLabel(collection.teas.filter(tea => tea.category === item.id).length)}</small>
              </span>
            </a>)}
            {!collection.categories.length && <p className="chest-empty">Добавьте первую коллекцию, чтобы заполнить шкатулку.</p>}
          </div>
        </div>
      </div>
      <button className="chest-lid" ref={lid} type="button" aria-label="Открыть шкатулку"
        inert={open} aria-hidden={open} onClick={() => toggle(true)}>
        <span className="chest-lid-front">
          <span className="chest-inscription">
            <strong>Tea Collection</strong>
            <span>Моя чайная коллекция</span>
          </span>
          <span className="chest-clasp" aria-hidden="true" />
        </span>
        <span className="chest-lid-back" aria-hidden="true" />
      </button>
    </div>
    <div className="chest-foot">
      {open ? <small className="chest-image-note">Обложки созданы с помощью ИИ</small> : <p>Нажми, чтобы открыть</p>}
    </div>
  </section>
}
