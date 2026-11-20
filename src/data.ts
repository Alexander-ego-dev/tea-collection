export const covers = ['Зелёный чай', 'Чёрный чай', 'Белый чай', 'Улун', 'Пуэр', 'Травяной чай']
export const brands = ['Curtis', 'Greenfield', 'Tess', 'Ahmad Tea', 'Richard']
export type Category = { id: string; name: string; cover: number; photo?: string; sourcePhoto?: string }
export type Tea = {
  id: string; category: string; name: string; photo: string; notes: string
  rating: number; tasted: string; added: string; sourcePhoto?: string
}
export type Collection = { categories: Category[]; teas: Tea[]; revision?: string }
const initial: Collection = {
  categories: brands.map((name, cover) => ({ id: 'brand-' + cover, name, cover })), teas: [],
}

const database = new Promise<IDBDatabase>((resolve, reject) => {
  try {
    const request = indexedDB.open('tea-collection', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('album')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Закройте другие окна альбома и обновите страницу.'))
  } catch (error) { reject(error) }
})

export async function loadCollection(): Promise<Collection> {
  const db = await database
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('album', 'readwrite')
    const store = transaction.objectStore('album')
    const content = store.get('collection')
    const revision = store.get('revision')
    content.onsuccess = () => {
      // Only a genuinely empty database receives the new starter brands.
      if (content.result === undefined) store.put(initial, 'collection')
    }
    transaction.oncomplete = () => resolve({ ...(content.result ?? initial), revision: revision.result })
    transaction.onabort = () => reject(transaction.error)
  })
}

// A single transaction covers category edits, cascading deletion and backup restoration.
export async function saveCollection(collection: Collection, expectedRevision?: string): Promise<Collection> {
  const db = await database
  const revision = crypto.randomUUID()
  const { categories, teas } = collection
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('album', 'readwrite')
    const store = transaction.objectStore('album')
    const current = store.get('revision')
    let failure: unknown
    transaction.oncomplete = () => resolve({ categories, teas, revision })
    transaction.onabort = () => reject(failure ?? transaction.error)
    current.onsuccess = () => {
      try {
        if (current.result !== expectedRevision) {
          throw new Error('Коллекция изменилась в другом окне. Обновите страницу перед сохранением.')
        }
        store.put({ categories, teas }, 'collection')
        store.put(revision, 'revision')
      } catch (error) {
        failure = error
        transaction.abort()
      }
    }
  })
}

export function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'Хранилище заполнено. Освободите место и повторите действие.'
  if (error instanceof DOMException) return 'Не удалось обратиться к хранилищу. Повторите действие.'
  return error instanceof Error ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.'
}

const MiB = 1024 * 1024
export const MAX_BACKUP_BYTES = 64 * MiB
const MAX_PHOTO_BYTES = 40 * MiB
const MAX_PIXELS = 50_000_000
const PHOTO_EDGE = 1440
const photoError = () => new Error('Не удалось открыть фотографию. Попробуйте исправный файл JPEG или PNG.')

function readBlob<T>(blob: Blob, read: (reader: FileReader, blob: Blob) => void, message: string) {
  return new Promise<T>((resolve, reject) => {
    const reader = new FileReader()
    const fail = () => reject(new Error(message))
    const timeout = setTimeout(() => { reader.abort(); fail() }, 20000)
    reader.onload = () => resolve(reader.result as T)
    reader.onerror = reader.onabort = fail
    reader.onloadend = () => clearTimeout(timeout)
    try { read(reader, blob) } catch { clearTimeout(timeout); fail() }
  })
}

export function decodeImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    // Let the browser apply EXIF orientation and HEIF display transforms once.
    image.style.imageOrientation = 'from-image'
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      image.onload = image.onerror = null
      if (error) { image.removeAttribute('src'); reject(error) }
      else resolve(image)
    }
    const timeout = setTimeout(() => finish(new Error('Фотография не открылась вовремя. Выберите другой файл.')), 12000)
    image.onload = () => finish()
    image.onerror = () => finish(photoError())
    image.src = source
  })
}

function jpegSize(bytes: DataView) {
  // Scan JPEG markers up to the first frame, before allocating a decoded bitmap.
  for (let offset = 2; offset + 3 < bytes.byteLength;) {
    if (bytes.getUint8(offset++) !== 0xff) break
    while (offset < bytes.byteLength && bytes.getUint8(offset) === 0xff) offset++
    if (offset + 2 >= bytes.byteLength) break
    const marker = bytes.getUint8(offset++)
    if (marker === 0xda || marker === 0xd9) break
    const length = bytes.getUint16(offset)
    if (length < 2 || offset + length > bytes.byteLength) break
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && length >= 8) {
      return { width: bytes.getUint16(offset + 5), height: bytes.getUint16(offset + 3) }
    }
    offset += length
  }
  throw photoError()
}

function checkDimensions(width: number, height: number) {
  if (!width || !height) throw photoError()
  if (width * height > MAX_PIXELS) throw new Error('Разрешение фотографии превышает 50 Мп.')
}

export async function optimizePhoto(file: File) {
  if (!file.size) throw photoError()
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Фотография превышает 40 МиБ.')
  const header = new DataView(await readBlob<ArrayBuffer>(
    file.slice(0, MiB), (reader, blob) => reader.readAsArrayBuffer(blob), 'Не удалось прочитать фотографию.',
  ))
  if (header.byteLength >= 2 && header.getUint16(0) === 0xffd8) {
    const { width, height } = jpegSize(header)
    checkDimensions(width, height)
  }
  if (header.byteLength >= 24 && header.getUint32(0) === 0x89504e47 && header.getUint32(4) === 0x0d0a1a0a) {
    checkDimensions(header.getUint32(16), header.getUint32(20))
  }
  const extension = file.name.split('.').pop()?.toLowerCase()
  const heif = extension === 'heic' || extension === 'heif' || /^image\/hei[cf](?:-sequence)?$/.test(file.type)
  const input = heif && !file.type.startsWith('image/') ? file.slice(0, file.size, 'image/' + extension) : file
  const source = URL.createObjectURL(input)
  const canvas = document.createElement('canvas')
  let image: HTMLImageElement | undefined
  try {
    try { image = await decodeImage(source) }
    catch (error) {
      if (heif) throw new Error('Браузер не смог открыть HEIC или HEIF. Сохраните снимок как JPEG или PNG и повторите попытку.')
      throw error
    }
    checkDimensions(image.naturalWidth, image.naturalHeight)
    const scale = Math.min(1, PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw photoError()
    context.fillStyle = '#f7f3eb'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const encoded = await new Promise<Blob>((resolve, reject) => {
      const timeout = setTimeout(() => reject(photoError()), 12000)
      try {
        canvas.toBlob(blob => {
          clearTimeout(timeout)
          if (blob?.type === 'image/jpeg' && blob.size) resolve(blob)
          else reject(photoError())
        }, 'image/jpeg', 0.82)
      } catch { clearTimeout(timeout); reject(photoError()) }
    })
    return await readBlob<string>(encoded, (reader, blob) => reader.readAsDataURL(blob), 'Не удалось подготовить фотографию.')
  } catch (error) {
    if (error instanceof DOMException || error instanceof RangeError) throw photoError()
    throw error
  } finally {
    image?.removeAttribute('src')
    canvas.width = canvas.height = 1
    URL.revokeObjectURL(source)
  }
}

export function today() {
  const now = new Date()
  const part = (value: number) => String(value).padStart(2, '0')
  return [now.getFullYear(), part(now.getMonth() + 1), part(now.getDate())].join('-')
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const named = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
}
const invalid = () => new Error('Файл не является корректной резервной копией Tea Collection.')

export async function importCollection(file: File): Promise<Collection> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('Резервная копия превышает 64 МиБ.')
  if (!file.size) throw invalid()
  const source = await readBlob<string>(file, (reader, blob) => reader.readAsText(blob),
    'Не удалось прочитать резервную копию. Скопируйте файл на устройство и попробуйте снова.')
  let value: unknown
  try { value = JSON.parse(source) }
  catch (error) {
    if (error instanceof RangeError) throw new Error('Не хватило памяти, чтобы открыть резервную копию.')
    throw invalid()
  }
  if (!record(value) || ![1, 2].includes(Number(value.version)) || typeof value.version !== 'number'
    || !Array.isArray(value.categories) || !Array.isArray(value.teas)) throw invalid()
  const categoryIds = new Set<string>()
  for (const category of value.categories) {
    if (!record(category) || typeof category.id !== 'string' || !named(category.id, 100) || categoryIds.has(category.id)
      || !named(category.name, 80) || typeof category.cover !== 'number'
      || !Number.isInteger(category.cover) || category.cover < 0 || category.cover >= covers.length) throw invalid()
    categoryIds.add(category.id)
    for (const field of ['photo', 'sourcePhoto']) {
      const photo = category[field]
      if (photo !== undefined && typeof photo !== 'string') throw invalid()
      if (photo) await validateBackupPhoto(photo as string)
    }
  }
  const teaIds = new Set<string>()
  const teas: Tea[] = []
  for (const tea of value.teas) {
    if (!record(tea) || typeof tea.id !== 'string' || !named(tea.id, 100) || teaIds.has(tea.id)
      || typeof tea.category !== 'string' || !categoryIds.has(tea.category) || !named(tea.name, 120)
      || typeof tea.notes !== 'string' || tea.notes.length > 6000 || typeof tea.rating !== 'number'
      || !Number.isInteger(tea.rating) || tea.rating < 0 || tea.rating > 5
      || !validDate(tea.added) || (tea.tasted !== '' && !validDate(tea.tasted))
      || typeof tea.photo !== 'string') throw invalid()
    if (tea.photo) await validateBackupPhoto(tea.photo)
    if (tea.sourcePhoto !== undefined && typeof tea.sourcePhoto !== 'string') throw invalid()
    if (tea.sourcePhoto) await validateBackupPhoto(tea.sourcePhoto as string)
    teaIds.add(tea.id)
    const { id, category, name, photo, notes, rating, tasted, added, sourcePhoto } = tea as Tea
    teas.push({ id, category, name, photo, notes, rating, tasted, added, ...(sourcePhoto ? { sourcePhoto } : {}) })
  }
  return { categories: value.categories.map(({ id, name, cover, photo, sourcePhoto }) => ({
    id, name, cover, ...(photo ? { photo } : {}), ...(sourcePhoto ? { sourcePhoto } : {}),
  })), teas }
}

async function validateBackupPhoto(photo: string) {
  const prefix = 'data:image/jpeg;base64,'
  if (photo.length > 8 * MiB || !photo.startsWith(prefix)) throw invalid()
  let url: string | undefined
  let image: HTMLImageElement | undefined
  try {
    const data = atob(photo.slice(prefix.length))
    if (data.length < 12) throw invalid()
    const bytes = new Uint8Array(data.length)
    for (let i = 0; i < bytes.length; i++) bytes[i] = data.charCodeAt(i)
    const view = new DataView(bytes.buffer)
    if (view.getUint16(0) !== 0xffd8 || view.getUint16(bytes.length - 2) !== 0xffd9) throw invalid()
    const { width, height } = jpegSize(view)
    if (!width || !height || Math.max(width, height) > PHOTO_EDGE) throw invalid()
    url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
    image = await decodeImage(url)
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error('Не хватило памяти для проверки фотографии в резервной копии.')
    }
    throw invalid()
  } finally {
    image?.removeAttribute('src')
    if (url) URL.revokeObjectURL(url)
  }
}

export async function exportCollection({ categories, teas }: Collection) {
  const name = 'tea-collection-' + today() + '.json'
  // Version 2 adds collection covers and originals for reversible square cropping.
  let file: File
  try {
    const parts = ['{"version":2,"categories":', JSON.stringify(categories), ',"teas":[']
    for (const [index, tea] of teas.entries()) {
      if (index) parts.push(',')
      parts.push(JSON.stringify(tea))
    }
    parts.push(']}')
    file = new File(parts, name, { type: 'application/json' })
  } catch {
    throw new Error('Не хватило памяти для создания резервной копии.')
  }
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
