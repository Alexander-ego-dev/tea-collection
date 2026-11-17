import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, devices } from 'playwright'

const scope = '/tea-collection/'
const mime = {
  html: 'text/html', js: 'text/javascript', css: 'text/css', jpg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', woff2: 'font/woff2', webmanifest: 'application/manifest+json',
}

async function fixture(t) {
  const shell = await readFile('dist/index.html', 'utf8')
  const worker = await readFile('dist/sw.js', 'utf8')
  const css = shell.match(/href="\/tea-collection\/([^"]+\.css)"/)[1]
  const changedCss = css.replace('.css', '-next.css')
  let release = 'initial'
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/') return response.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Observer</title>')
    if (!path.startsWith(scope)) return response.writeHead(404).end()
    const file = path.slice(scope.length) || 'index.html'
    const type = mime[file.split('.').at(-1)] ?? 'application/octet-stream'
    try {
      if (release !== 'initial' && file === css) return response.writeHead(404).end()
      if (release === 'incomplete' && file === changedCss) return response.writeHead(404).end()
      let body
      if (release !== 'initial' && file === 'sw.js') {
        body = worker.replace(css, changedCss).replace(/'([0-9a-f]{16})'/, "'" + release + "'")
      } else if (release !== 'initial' && file === 'index.html') {
        body = shell.replace(css, changedCss).replace('<html ', '<html data-release="next" ')
      } else {
        body = await readFile(resolve('dist', file === changedCss ? css : file))
      }
      response.writeHead(200, { 'Content-Type': type, Vary: 'Origin' }).end(body)
    } catch { response.writeHead(404).end() }
  })
  await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  t.after(() => new Promise(ok => server.close(ok)))
  const host = 'http://127.0.0.1:' + server.address().port
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const context = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })
  context.setDefaultTimeout(8000)
  return { context, host, url: host + scope, css, changeRelease: next => { release = next } }
}

const chestLid = page => page.getByRole('button', { name: 'Открыть шкатулку' })
const openChest = page => chestLid(page).click()
const category = page => page.getByRole('link', { name: /Зелёный чай/ })
const settings = page => page.getByRole('button', { name: 'Настройки', exact: true })
const add = page => page.getByRole('button', { name: 'Добавить', exact: true }).click()
const edit = page => page.getByRole('button', { name: 'Редактировать чай' }).click()
const save = page => page.getByRole('button', { name: 'Сохранить в коллекцию' }).click()
const close = page => page.getByRole('button', { name: 'Закрыть' }).click()
const alert = page => page.getByRole('alert')
const dialog = page => page.getByRole('dialog')
const attach = (page, name, mimeType, buffer) => dialog(page).locator('input[type=file]').setInputFiles({ name, mimeType, buffer })

async function photoSize(locator) {
  await locator.waitFor()
  return locator.evaluate(async image => {
    await image.decode()
    return [image.naturalWidth, image.naturalHeight]
  })
}

test('tea chest opens, closes, keeps album navigation and scrolls custom covers offline', { timeout: 35000 }, async t => {
  const { context, url } = await fixture(t)
  const page = await context.newPage()
  await page.goto(url)
  await chestLid(page).waitFor()
  const tray = page.locator('.chest-tray')
  const lid = page.locator('.chest-lid')
  const angle = () => lid.evaluate(node => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform)
    return Math.atan2(matrix.m23, matrix.m22) * 180 / Math.PI
  })
  assert.equal(await tray.getAttribute('inert'), '')
  assert.equal(await category(page).count(), 0)
  await openChest(page)
  await poll(async () => (await angle()) > 8 && (await angle()) < 100)
  await poll(async () => (await angle()) > 106)
  assert.equal(await page.getByRole('button', { name: 'Закрыть шкатулку' })
    .evaluate(button => button.matches(':focus-visible')), false)
  await page.getByRole('button', { name: 'Закрыть шкатулку' }).click()
  await poll(async () => Math.abs(await angle()) < .1)
  await chestLid(page).waitFor()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await chestLid(page).focus()
  await page.keyboard.press('Enter')
  assert.ok((await angle()) > 106)
  assert.equal(await page.getByRole('button', { name: 'Закрыть шкатулку' })
    .evaluate(button => document.activeElement === button && button.matches(':focus-visible')), true)
  for (const name of ['Зелёный чай', 'Чёрный чай', 'Белый чай', 'Улун', 'Пуэр', 'Травяной чай']) {
    await tray.getByRole('link', { name: new RegExp(name) }).click()
    await page.getByRole('heading', { name, exact: true }).waitFor()
    await page.getByRole('heading', { name: 'Первая страница ждёт' }).waitFor()
    await page.getByRole('link', { name: 'Все коллекции' }).click()
    await tray.getByRole('link', { name: new RegExp(name) }).waitFor()
    assert.equal(await chestLid(page).count(), 0)
  }
  await page.locator('.collection-photo').last().waitFor()
  assert.equal(await page.locator('.collection-photo').count(), 6)
  await page.waitForFunction(() => navigator.serviceWorker.controller)

  await page.getByRole('button', { name: 'Новая коллекция' }).click()
  const longName = 'Личная подборка редких весенних чаёв из высокогорных садов Японии'
  await page.getByLabel('Название коллекции').fill(longName)
  await page.getByRole('button', { name: 'Создать коллекцию' }).click()
  const custom = page.getByRole('link', { name: /Личная подборка/ }).locator('.cover')
  await custom.waitFor()
  assert.equal(await tray.getByRole('link').count(), 7)
  assert.match(await tray.getByRole('link', { name: /Личная подборка/ }).textContent(), new RegExp(longName))
  const fits = await tray.locator('.chest-label').evaluateAll(labels => labels.every(label => {
    const cover = label.parentElement.querySelector('.cover').getBoundingClientRect()
    const bounds = label.getBoundingClientRect()
    const style = getComputedStyle(label)
    return bounds.top > cover.top && Math.abs(bounds.bottom - cover.bottom) < 1
      && bounds.width <= cover.width && style.backgroundColor === 'rgba(0, 0, 0, 0)'
      && style.backgroundImage.includes('linear-gradient')
  }))
  assert.equal(fits, true)
  const scroll = await tray.evaluate(node => {
    const columns = getComputedStyle(node.firstElementChild).gridTemplateColumns.split(' ').length
    node.scrollTop = node.scrollHeight
    return { top: node.scrollTop, columns, horizontal: document.documentElement.scrollWidth > innerWidth }
  })
  assert.equal(scroll.columns, 2)
  assert.ok(scroll.top > 0 && !scroll.horizontal)
  await tray.getByRole('link', { name: /Личная подборка/ }).click()
  await page.getByRole('link', { name: 'Все коллекции' }).click()
  await poll(() => tray.evaluate(node => node.scrollTop > 0))
  assert.match(await custom.evaluate(node => getComputedStyle(node).backgroundImage), /\/tea-collection\/sencha\.jpg/)
  await context.setOffline(true)
  await page.reload()
  await openChest(page)
  await custom.waitFor()
  const wood = await page.locator('.tea-chest').evaluate(async node => {
    const path = getComputedStyle(node).getPropertyValue('--wood').match(/url\(["']?(.*?)["']?\)/)[1]
    const response = await fetch(new URL(path, location.origin))
    return response.ok && (await response.arrayBuffer()).byteLength
  })
  assert.ok(wood > 0 && wood < 300000)
  assert.equal(await custom.evaluate(node => node.classList.contains('collection-photo')), false)

  const covers = await page.locator('.collection-photo').evaluateAll(nodes => Promise.all(nodes.map(async node => {
    const style = getComputedStyle(node)
    const url = new URL(style.backgroundImage.slice(5, -2))
    const response = await fetch(url)
    if (!response.ok) throw new Error('Cover not cached: ' + url)
    const bytes = await response.arrayBuffer()
    const image = new Image()
    image.src = url.href
    await image.decode()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).join(',')
    return { path: url.pathname, sameOrigin: url.origin === location.origin, width: image.naturalWidth,
      height: image.naturalHeight, size: bytes.byteLength, digest, fit: style.backgroundSize }
  })))
  assert.deepEqual(covers.map(cover => cover.path), ['green', 'black', 'white', 'oolong', 'puer', 'herbal']
    .map(name => scope + 'images/tea/' + name + '.webp'))
  assert.equal(new Set(covers.map(cover => cover.digest)).size, 6)
  assert.ok(covers.every(cover => cover.sameOrigin && cover.fit === 'cover' && cover.width >= 450 &&
    cover.height >= 450 && cover.size < 200000))
  await page.getByText('Обложки созданы с помощью ИИ', { exact: true }).waitFor()
})

test('legacy data, CRUD, backup validation, atomic restore and stale tabs', { timeout: 60000 }, async t => {
  const { context, host, url } = await fixture(t)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(host)
  const legacyPhoto = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 960
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#738066'
    ctx.fillRect(0, 0, 960, 480)
    return canvas.toDataURL('image/jpeg')
  })
  await page.evaluate(photo => new Promise((resolve, reject) => {
    const request = indexedDB.open('tea-collection', 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('album').put({
        categories: [{ id: 'tea-0', name: 'Зелёный чай', cover: 0 }],
        teas: [{ id: 'legacy', category: 'tea-0', name: 'Сэнча', photo, notes: '', rating: 0, tasted: '', added: '2026-01-15' }],
      }, 'collection')
    }
    request.onsuccess = () => { request.result.close(); resolve() }
    request.onerror = () => reject(request.error)
  }), legacyPhoto)
  await page.goto(url)
  await openChest(page)
  await category(page).click()
  assert.equal(await page.getByAltText('Сэнча').getAttribute('src'), legacyPhoto)

  const stale = await context.newPage()
  await stale.goto(page.url())
  await edit(stale)
  await stale.getByLabel('Название чая').fill('Устаревшая запись')
  await add(page)
  await page.getByLabel('Название чая').fill('Гёкуро')
  const images = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 900
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f00'
    ctx.fillRect(0, 0, 900, 900)
    ctx.fillStyle = '#00f'
    ctx.fillRect(900, 0, 900, 900)
    return ['image/png', 'image/jpeg'].map(type => canvas.toDataURL(type).split(',')[1])
  })
  const preview = page.getByAltText('Выбранная фотография')
  await attach(page, 'wide.png', 'image/png', Buffer.from(images[0], 'base64'))
  assert.deepEqual(await photoSize(preview), [1440, 720])
  const jpeg = Buffer.from(images[1], 'base64')
  const orientation = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000', 'hex')
  await attach(page, 'rotated.jpg', 'image/jpeg', Buffer.concat([jpeg.subarray(0, 2), orientation, jpeg.subarray(2)]))
  await page.waitForFunction(() => document.querySelector('.photo-picker img')?.naturalHeight === 1440)
  assert.deepEqual(await photoSize(preview), [720, 1440])
  for (const type of ['image/jpeg', 'image/heic', 'image/heif']) {
    await attach(page, 'broken.' + type.split('/')[1], type, Buffer.from('broken'))
    await alert(page).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Сохранить в коллекцию' }).isEnabled(), true)
    assert.deepEqual(await photoSize(preview), [720, 1440])
  }
  await page.getByLabel('Мои впечатления').fill('Мягкий вкус.')
  await save(page)
  await dialog(page).waitFor({ state: 'hidden' })
  await save(stale)
  await alert(stale).filter({ hasText: 'изменилась в другом окне' }).waitFor()
  await stale.close()

  const book = page.locator('.book')
  const sheet = page.locator('.sheet[data-position=current]')
  const outgoing = book.locator('[data-position=outgoing]')
  const count = page.locator('.album output')
  const zones = sheet.locator('.photo-zones')
  const center = zones.getByRole('button', { name: /Показать (заметки|фотографию)/ })
  const previous = zones.getByRole('button', { name: 'Предыдущий чай' })
  const next = zones.getByRole('button', { name: 'Следующий чай' })
  function still() { return outgoing.waitFor({ state: 'detached' }) }

  async function press(fraction, mode = 'touch') {
    const bounds = await zones.boundingBox()
    const x = bounds.x + bounds.width * fraction
    const y = Math.max(0, bounds.y) + Math.min(100, bounds.height / 3)
    if (mode === 'mouse') await page.mouse.click(x, y)
    else await page.touchscreen.tap(x, y)
  }

  async function checkPhoto(name, size) {
    const photo = sheet.getByAltText(name)
    assert.deepEqual(await photoSize(photo), size)
    const layout = await photo.evaluate(image => {
      const sheet = image.closest('.sheet').getBoundingClientRect()
      const photo = image.getBoundingClientRect()
      return { fit: getComputedStyle(image).objectFit, portion: photo.height / sheet.height,
        viewport: sheet.height / innerHeight, noHorizontalScroll: document.documentElement.scrollWidth === innerWidth }
    })
    assert.equal(layout.fit, 'contain')
    assert.ok(layout.portion >= .85 && layout.portion <= .95, JSON.stringify(layout))
    assert.ok(layout.viewport >= .75 && layout.noHorizontalScroll, JSON.stringify(layout))
  }

  // The click regions fill exactly 20%, 60%, and 20% of the photo viewport.
  const widths = await zones.evaluate(node => [...node.children].map(button =>
    button.getBoundingClientRect().width / node.getBoundingClientRect().width))
  assert.ok(widths.every((width, index) => Math.abs(width - [.2, .6, .2][index]) < .002))
  assert.equal(await page.getByRole('button', { name: /Предыдущая страница|Следующая страница/ }).count(), 0)
  await checkPhoto('Гёкуро', [720, 1440])
  assert.equal(await next.isDisabled(), true)
  await press(.9)
  assert.equal(await count.textContent(), '2 / 2')
  assert.equal(await center.getAttribute('aria-pressed'), 'false')
  await press(.22)
  await page.getByRole('button', { name: 'Показать фотографию' }).waitFor()
  await press(.52)
  await page.getByRole('button', { name: 'Показать заметки' }).waitFor()
  await press(.78, 'mouse')
  await page.getByRole('button', { name: 'Показать фотографию' }).waitFor()

  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 390, height: 300 })
  const cdp = await context.newCDPSession(page)
  const { x: left, y: top, width } = await zones.boundingBox()
  const x = Math.round(left + width / 2)
  const y = Math.round(Math.max(0, top) + 75)
  const startingScroll = await page.evaluate(() => scrollY)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (const distance of [20, 55, 110]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await poll(() => page.evaluate(start => scrollY > start, startingScroll))
  assert.equal(await center.getAttribute('aria-pressed'), 'true')
  assert.equal(await count.textContent(), '2 / 2')
  await page.setViewportSize(viewport)
  await page.evaluate(() => scrollTo(0, 0))

  const before = await sheet.boundingBox()
  await press(.1)
  await poll(async () => (await count.textContent()) === '1 / 2')
  const frames = await outgoing.evaluate(old => new Promise(resolve => {
    const current = old.parentElement.querySelector('[data-position=current]')
    const frames = []
    function sample() {
      const style = getComputedStyle(current)
      const bounds = current.getBoundingClientRect()
      frames.push({ opacity: Number(style.opacity), previous: Number(getComputedStyle(old).opacity),
        oldVisible: getComputedStyle(old).visibility === 'visible', transform: style.transform,
        box: [bounds.x, bounds.y, bounds.width, bounds.height] })
      if (style.animationName === 'none' || frames.length > 25) resolve(frames)
      else requestAnimationFrame(sample)
    }
    sample()
  }))
  assert.ok(frames.some(frame => frame.opacity > 0 && frame.opacity < 1 && frame.previous === 1 && frame.oldVisible))
  assert.ok(frames.every(frame => frame.transform === 'none' &&
    frame.box.every((part, axis) => Math.abs(part - [before.x, before.y, before.width, before.height][axis]) < .5)))
  assert.ok(frames.every((frame, i) => !i || frame.opacity >= frames[i - 1].opacity))
  await still()
  await checkPhoto('Сэнча', [960, 480])
  assert.equal(await center.getAttribute('aria-pressed'), 'false')
  assert.equal(await previous.isDisabled(), true)
  await press(.1, 'mouse')
  assert.equal(await count.textContent(), '1 / 2')
  await press(.50, 'mouse')
  await page.getByRole('button', { name: 'Показать фотографию' }).waitFor()

  // The first press wins during the fade; navigation works again immediately after it.
  await press(.90, 'mouse')
  await press(.10, 'mouse')
  await press(.90, 'mouse')
  await still()
  assert.equal(await count.textContent(), '2 / 2')
  assert.equal(await center.getAttribute('aria-pressed'), 'false')
  await press(.10, 'mouse')
  await still()
  assert.equal(await count.textContent(), '1 / 2')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press('ArrowRight')
  assert.equal(await count.textContent(), '2 / 2')
  assert.equal(await outgoing.count(), 0)
  await page.keyboard.press('ArrowLeft')
  assert.equal(await count.textContent(), '1 / 2')

  await page.reload()
  await page.getByAltText('Сэнча').waitFor()
  await edit(page)
  await page.getByLabel('Название чая').fill('Сэнча весенняя')
  await save(page)
  await page.getByAltText('Сэнча весенняя').waitFor()
  await settings(page).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт коллекции' }).click()
  const download = await downloading
  const backup = await readFile(await download.path())
  const v1 = JSON.parse(backup)
  assert.equal(v1.version, 1)
  assert.equal(v1.teas[0].photo, legacyPhoto)
  assert.equal(v1.revision, undefined)
  await close(page)

  await edit(page)
  await page.getByRole('button', { name: 'Удалить чай' }).click()
  await page.getByRole('button', { name: 'Удалить', exact: true }).click()
  await page.getByAltText('Гёкуро').waitFor()
  await settings(page).click()
  const folder = await mkdtemp(join(tmpdir(), 'tea-test-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  const oversized = join(folder, 'oversized.json')
  await writeFile(oversized, '')
  await truncate(oversized, 64 * 1024 * 1024 + 1)
  await dialog(page).locator('input[type=file]').setInputFiles(oversized)
  await alert(page).filter({ hasText: '64 МиБ' }).waitFor()
  await attach(page, 'broken.json', 'application/json', Buffer.from('{'))
  await alert(page).filter({ hasText: 'не является корректной' }).waitFor()
  const damaged = JSON.parse(backup)
  damaged.teas[0].photo = 'data:image/jpeg;base64,/9hzdHVi/9k='
  await attach(page, 'damaged.json', 'application/json', Buffer.from(JSON.stringify(damaged)))
  await alert(page).filter({ hasText: 'не является корректной' }).waitFor()

  await page.evaluate(() => {
    const original = FileReader.prototype.readAsText
    FileReader.prototype.readAsText = function () {
      FileReader.prototype.readAsText = original
      throw new DOMException('File read error', 'NotReadableError')
    }
  })
  const restore = () => attach(page, 'backup.json', 'application/json', backup)
  await restore()
  await alert(page).filter({ hasText: 'Не удалось прочитать' }).waitFor()
  await restore()
  await page.getByRole('heading', { name: 'Восстановить коллекцию?' }).waitFor()
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value, key) {
      original.call(this, value, key) // Queue the data write before failing the transaction.
      if (key === 'collection') throw new DOMException('Disk full', 'QuotaExceededError')
    }
  })
  const confirm = () => page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await confirm()
  await alert(page).filter({ hasText: 'Хранилище заполнено' }).waitFor()
  await page.reload()
  await page.getByAltText('Гёкуро').waitFor()
  assert.equal(await page.locator('.album output').textContent(), '1 / 1')
  await settings(page).click()
  await restore()
  await confirm()
  await category(page).click()
  assert.equal(await page.getByAltText('Сэнча весенняя').getAttribute('src'), legacyPhoto)
  await context.setOffline(true)
  await page.reload()
  await page.getByAltText('Сэнча весенняя').waitFor()
  assert.deepEqual(errors, [])
})

async function poll(check) {
  const deadline = Date.now() + 10000
  do {
    if (await check()) return
    await delay(50)
  } while (Date.now() < deadline)
  assert.fail('Service Worker did not reach the expected state')
}

test('Pages deployment keeps old assets offline until all old tabs close', { timeout: 45000 }, async t => {
  const { context, host, url, css, changeRelease } = await fixture(t)
  const observer = await context.newPage()
  await observer.goto(host)
  const first = await context.newPage()
  await first.goto(url)
  await chestLid(first).waitFor()
  await first.waitForFunction(() => navigator.serviceWorker.controller)
  const second = await context.newPage()
  await second.goto(url)
  const oldCache = await first.evaluate(async () => (await caches.keys())[0])
  const update = page => page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    await reg.update()
  })
  changeRelease('incomplete')
  await update(first)
  await poll(() => first.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return !reg.installing && !reg.waiting
  }))
  assert.equal(await first.evaluate(async key => caches.has(key), oldCache), true)

  changeRelease('complete')
  await update(first)
  await poll(() => first.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting))
  await context.setOffline(true)
  assert.equal(await first.evaluate(async path => (await fetch(path)).ok, scope + css), true)
  await second.reload()
  await chestLid(second).waitFor()
  assert.equal(await second.locator('html').getAttribute('data-release'), null)
  await first.close()
  assert.equal(await second.evaluate(async path => (await fetch(path)).ok, scope + css), true)
  assert.equal(await second.evaluate(async key => caches.has(key), oldCache), true)
  await second.close()

  await poll(() => observer.evaluate(async ({ oldCache, scope }) => {
    const reg = await navigator.serviceWorker.getRegistration(scope)
    return reg.active?.state === 'activated' && !(await caches.has(oldCache))
      && (await caches.keys()).some(name => name.endsWith(':complete'))
  }, { oldCache, scope }))
  const updated = await context.newPage()
  const response = await updated.goto(url)
  assert.equal(response.fromServiceWorker(), true)
  await chestLid(updated).waitFor()
  assert.equal(await updated.locator('html').getAttribute('data-release'), 'next')
  const manifest = await updated.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]')
    const content = await (await fetch(link.href)).json()
    return { scope: new URL(content.scope, link.href).pathname,
      icons: await Promise.all(content.icons.map(async icon => (await fetch(new URL(icon.src, link.href))).ok)) }
  })
  assert.deepEqual(manifest, { scope, icons: [true, true] })
})
