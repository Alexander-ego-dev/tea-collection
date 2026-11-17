import { StrictMode, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, ArrowUpRight, BookOpen, Check, ChevronRight, Coffee, Ellipsis, Leaf, Plus, Settings, Trash2 } from 'lucide-react'
import '@fontsource-variable/lora'
import '@fontsource-variable/inter'
import './style.css'
import { Album, Cover } from './Album'
import { Dialog, TeaEditor } from './Editor'
import { covers, errorMessage, exportCollection, importCollection, loadCollection, saveCollection, type Category, type Collection, type Tea } from './data'

type Panel =
  | { kind: 'settings' }
  | { kind: 'category'; category?: Category }
  | { kind: 'tea'; tea?: Tea }
  | { kind: 'confirm'; title: string; description: string; next: Collection; success: string; finish?: () => void; destructive?: boolean }

function route() {
  const hash = location.hash
  if (!hash.startsWith('#/album/')) return ''
  try { return decodeURIComponent(hash.slice(8)) } catch { return '' }
}
const navigate = (id = '') => { location.hash = id ? '/album/' + encodeURIComponent(id) : '/' }
const plural = new Intl.PluralRules('ru')
function countLabel(count: number) {
  const form = plural.select(count)
  return count + ' ' + (form === 'one' ? 'запись' : form === 'few' ? 'записи' : 'записей')
}

function App() {
  const [collection, setCollection] = useState<Collection>()
  const [activeId, setActiveId] = useState(route)
  const [index, setIndex] = useState(0)
  const [panel, setPanel] = useState<Panel>()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  const nextPage = useRef<number | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    void loadCollection().then(setCollection, error => setFailure(errorMessage(error)))
    function sync() {
      setActiveId(route())
      setIndex(nextPage.current ?? 0)
      nextPage.current = null
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const category = collection?.categories.find(item => item.id === activeId)
  const teas = collection?.teas.filter(tea => tea.category === activeId) ?? []
  const page = Math.min(index, Math.max(0, teas.length - 1))
  function open(value?: Panel) { setFailure(''); setPanel(value) }
  async function run(action: () => Promise<void>) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setFailure('')
    try { await action() }
    catch (error) { setFailure(errorMessage(error)) }
    finally { pending.current = false; setBusy(false) }
  }
  function commit(next: Collection, success: string, finish?: () => void) {
    void run(async () => {
      const saved = await saveCollection(next, collection?.revision)
      setCollection(saved)
      open()
      setNotice(success)
      finish?.()
    })
  }
  function saveTea(tea: Tea) {
    if (!collection) return
    const exists = collection.teas.some(item => item.id === tea.id)
    const entries = exists ? collection.teas.map(item => item.id === tea.id ? tea : item) : [...collection.teas, tea]
    commit({ ...collection, teas: entries }, exists ? 'Изменения сохранены' : 'Чай добавлен в альбом', () => {
      const position = entries.filter(item => item.category === tea.category).findIndex(item => item.id === tea.id)
      if (activeId !== tea.category) { nextPage.current = position; navigate(tea.category) }
      else setIndex(position)
    })
  }
  function deleteTea(tea: Tea) {
    if (!collection) return
    open({ kind: 'confirm', title: 'Удалить чай?', description: `Запись «${tea.name}» будет удалена из альбома.`,
      next: { ...collection, teas: collection.teas.filter(item => item.id !== tea.id) },
      success: 'Чай удалён', destructive: true })
  }
  function saveCategory(event: FormEvent<HTMLFormElement>, item?: Category) {
    event.preventDefault()
    if (!collection) return
    const name = String(new FormData(event.currentTarget).get('name')).trim()
    if (!name) { setFailure('Введите название коллекции.'); return }
    if (collection.categories.some(entry => entry.id !== item?.id && entry.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) {
      setFailure('Коллекция с таким названием уже есть.')
      return
    }
    const categories = item ? collection.categories.map(entry => entry.id === item.id ? { ...entry, name } : entry)
      : [...collection.categories, { id: crypto.randomUUID(), name, cover: collection.categories.length % covers.length }]
    commit({ ...collection, categories }, item ? 'Название сохранено' : 'Коллекция создана')
  }
  function deleteCategory(item: Category) {
    if (!collection) return
    const count = collection.teas.filter(tea => tea.category === item.id).length
    open({ kind: 'confirm', title: 'Удалить коллекцию?', description: count
      ? `Коллекция «${item.name}» и все её записи (${count}) будут удалены.` : `Коллекция «${item.name}» будет удалена.`,
      next: { categories: collection.categories.filter(entry => entry.id !== item.id),
        teas: collection.teas.filter(tea => tea.category !== item.id) },
      success: 'Коллекция удалена', finish: () => navigate(), destructive: true })
  }
  function readBackup(file?: File) {
    if (!file) return
    void run(async () => {
      const next = await importCollection(file)
      open({ kind: 'confirm', title: 'Восстановить коллекцию?', description: 'Резервная копия заменит все текущие коллекции, фотографии и заметки.',
        next, success: 'Коллекция восстановлена', finish: () => navigate() })
    })
  }

  return <div className="shell">
    <header className="topbar">
      <a className="brand" href="#/" aria-label="Tea Collection, главная"><span className="brand-icon"><Leaf size={20} strokeWidth={1.6} /></span><span>Tea Collection</span></a>
      <button className="icon ring" aria-label="Настройки" disabled={!collection} onClick={() => open({ kind: 'settings' })}><Settings size={20} strokeWidth={1.6} /></button>
    </header>
    <main>
      {!collection ? <p className="loading" role={failure ? 'alert' : 'status'}>{failure || 'Открываем альбом…'}
        {failure && <button className="text-button" onClick={() => location.reload()}>Обновить страницу</button>}
      </p> : <motion.div key={category?.id ?? 'home'} initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.23 }}>
        {category ? <>
          <div className="album-heading">
            <a href="#/" className="text-button back-link"><ArrowLeft size={17} /> Все коллекции</a>
            <div className="album-title">
              <div><h1>{category.name}</h1><p>{countLabel(teas.length)}</p></div>
              <div className="actions">
                <button className="icon ring" aria-label="Настроить коллекцию" onClick={() => open({ kind: 'category', category })}><Ellipsis size={20} /></button>
                <button className="primary" onClick={() => open({ kind: 'tea' })}><Plus size={18} /> Добавить</button>
              </div>
            </div>
          </div>
          {teas.length ? <Album category={category} teas={teas} index={page} change={setIndex} edit={tea => open({ kind: 'tea', tea })} />
            : <div className="empty"><div className="empty-icon"><BookOpen size={30} strokeWidth={1.4} /></div>
              <h2>Первая страница ждёт</h2><p>Добавьте чай, чтобы сохранить фотографию и впечатления.</p>
              <button className="primary" onClick={() => open({ kind: 'tea' })}><Plus size={17} /> Добавить первый чай</button>
            </div>}
        </> : <>
          <section className="hero">
            <div className="hero-copy"><span className="eyebrow"><Leaf size={15} /> Чайный дневник</span>
              <h1>Tea Collection</h1><p>Моя маленькая история чая</p>
            </div>
            <Cover index={0} className="hero-art" />
          </section>
          <section aria-labelledby="collections-title">
            <div className="section-heading"><h2 id="collections-title">Мои коллекции</h2>
              <button className="outline" onClick={() => open({ kind: 'category' })}><Plus size={17} /> <span>Новая коллекция</span></button>
            </div>
            <div className="collection-grid">{collection.categories.map(item =>
              <a key={item.id} className="collection-card" href={'#/album/' + encodeURIComponent(item.id)}>
                <Cover index={item.cover} />
                <div className="collection-summary"><div><h3>{item.name}</h3><p>{countLabel(collection.teas.filter(tea => tea.category === item.id).length)}</p></div>
                  <span className="card-arrow"><ArrowUpRight size={19} strokeWidth={1.75} /></span>
                </div>
              </a>)}
            </div>
            {!collection.categories.length && <div className="empty"><Coffee size={30} /><p>Создайте коллекцию, чтобы открыть первую страницу альбома.</p></div>}
          </section>
        </>}
      </motion.div>}
    </main>
    <footer><Leaf size={15} /> Tea Collection</footer>
    {notice && <div className="toast" role="status"><Check size={18} /> {notice}</div>}
    {collection && panel?.kind === 'tea' && category && <TeaEditor tea={panel.tea} category={category.id}
      categories={collection.categories} close={() => open()} save={saveTea} remove={deleteTea} busy={busy} failure={failure} />}
    {collection && panel?.kind === 'settings' && <Dialog title="Настройки" close={() => open()} busy={busy}>
      <p className="muted">Резервная копия сохраняет коллекции, фотографии и заметки в одном файле.</p>
      <button className="setting" disabled={busy} onClick={() => void run(() => exportCollection(collection))}><ArrowDownToLine /> Экспорт коллекции <ChevronRight size={17} /></button>
      <label className="setting import"><ArrowUpFromLine /> {busy ? 'Подождите…' : 'Импорт коллекции'} <ChevronRight size={17} />
        <input type="file" accept=".json,application/json" disabled={busy} onChange={event => { readBackup(event.target.files?.[0]); event.target.value = '' }} />
      </label>
      {failure && <p className="error" role="alert">{failure}</p>}
    </Dialog>}
    {panel?.kind === 'category' && <Dialog title={panel.category ? 'Настройки коллекции' : 'Новая коллекция'} close={() => open()} busy={busy}>
      <form onSubmit={event => saveCategory(event, panel.category)}>
        <label>Название коллекции<input name="name" required maxLength={80} defaultValue={panel.category?.name} /></label>
        {failure && <p className="error" role="alert">{failure}</p>}
        <button className="primary" disabled={busy}>{panel.category ? 'Сохранить название' : 'Создать коллекцию'}</button>
        {panel.category && <button className="danger text-button" type="button" disabled={busy} onClick={() => { if (panel.category) deleteCategory(panel.category) }}>
          <Trash2 size={17} /> Удалить коллекцию</button>}
      </form>
    </Dialog>}
    {panel?.kind === 'confirm' && <Dialog title={panel.title} close={() => open()} busy={busy}>
      <p className="muted">{panel.description}</p>
      {failure && <p className="error" role="alert">{failure}</p>}
      <div className="confirm-actions"><button className="outline" disabled={busy} onClick={() => open()}>Отмена</button>
        <button className={panel.destructive ? 'primary destructive' : 'primary'} disabled={busy}
          onClick={() => commit(panel.next, panel.success, panel.finish)}>{panel.destructive ? 'Удалить' : 'Восстановить'}</button>
      </div>
    </Dialog>}
  </div>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => console.error('Service Worker', error))
}
