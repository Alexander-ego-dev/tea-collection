import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Check, ChevronRight, Plus, Settings, Trash2 } from 'lucide-react'
import '@fontsource-variable/lora'
import '@fontsource-variable/inter'
import './style.css'
import './journal.css'
import { Album } from './Album'
import { TeaBook } from './TeaBook'
import { CategoryEditor, Dialog, TeaEditor } from './Editor'
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
  const [bookOpen, setBookOpen] = useState(() => !!route())
  const [panel, setPanel] = useState<Panel>()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const pending = useRef(false)
  const bookScroll = useRef(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    void loadCollection().then(setCollection, error => setFailure(errorMessage(error)))
    function sync() {
      const id = route()
      if (id) setBookOpen(true)
      setActiveId(id)
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
      if (activeId !== tea.category) navigate(tea.category)
    })
  }
  function deleteTea(tea: Tea) {
    if (!collection) return
    open({ kind: 'confirm', title: 'Удалить чай?', description: `Запись «${tea.name}» будет удалена из альбома.`,
      next: { ...collection, teas: collection.teas.filter(item => item.id !== tea.id) },
      success: 'Чай удалён', destructive: true })
  }
  function saveCategory(name: string, photo: { photo: string; sourcePhoto: string }, item?: Category) {
    if (!collection) return
    if (!name) { setFailure('Введите название коллекции.'); return }
    if (collection.categories.some(entry => entry.id !== item?.id && entry.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) {
      setFailure('Коллекция с таким названием уже есть.')
      return
    }
    const categories = item ? collection.categories.map(entry => entry.id === item.id ? { ...entry, name, ...photo } : entry)
      : [...collection.categories, { id: crypto.randomUUID(), name, cover: collection.categories.length % covers.length, ...photo }]
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

  const startTea = () => open({ kind: 'tea' })
  return <div className={category ? 'shell journal-shell' : 'shell library-shell'}>
    {category ? <header className="journal-bar">
      <a href="#/" className="journal-icon" aria-label="Все коллекции"><ArrowLeft size={23} strokeWidth={1.4} /></a>
      <h1>{category.name}</h1>
      <button type="button" className="journal-icon journal-add" aria-label="Добавить" onClick={startTea}><Plus size={24} strokeWidth={1.35} /></button>
    </header> : <header className="topbar">
        <button className="icon ring" aria-label="Настройки" disabled={!collection} onClick={() => open({ kind: 'settings' })}><Settings size={20} strokeWidth={1.6} /></button>
    </header>}
    <main>
      {!collection ? <p className="loading" role={failure ? 'alert' : 'status'}>{failure || 'Открываем альбом…'}
        {failure && <button className="text-button" onClick={() => location.reload()}>Обновить страницу</button>}
      </p> : <motion.div className={category ? 'journal-view' : undefined} key={category?.id ?? 'home'} initial={reduced ? false : { opacity: 0, y: category ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.23 }}>
        {category ? <Album key={category.id} teas={teas} edit={tea => open({ kind: 'tea', tea })} add={startTea} />
          : <TeaBook collection={collection} open={bookOpen} setOpen={setBookOpen}
            add={() => open({ kind: 'category' })} edit={category => open({ kind: 'category', category })}
            countLabel={countLabel} scroll={bookScroll} />}
      </motion.div>}
    </main>
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
    {panel?.kind === 'category' && <CategoryEditor category={panel.category} close={() => open()}
      save={(name, photo) => saveCategory(name, photo, panel.category)} remove={deleteCategory} busy={busy} failure={failure} />}
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
