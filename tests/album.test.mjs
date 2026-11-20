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
  t.after(() => new Promise(ok => { server.closeAllConnections(); server.close(ok) }))
  const host = 'http://127.0.0.1:' + server.address().port
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const context = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })
  context.setDefaultTimeout(8000)
  return { context, host, url: host + scope, css, changeRelease: next => { release = next } }
}

const bookLid = page => page.getByRole('button', { name: 'Открыть книгу' })
const openBook = page => bookLid(page).click()
const dialog = page => page.getByRole('dialog')
const close = page => dialog(page).getByRole('button', { name: 'Закрыть', exact: true }).click()
const alert = page => page.getByRole('alert')
const back = page => page.getByRole('link', { name: 'Все коллекции' }).click()
const brand = (page, name) => page.locator('.brand-card').getByRole('link', { name: new RegExp(name) })
const editBrand = (page, name) => page.getByRole('button', { name: 'Редактировать коллекцию — ' + name, exact: true }).click()
const attach = (page, name, buffer) => dialog(page).locator('input[type=file]').setInputFiles({
  name, mimeType: 'application/json', buffer,
})
async function photo(page, selector = '.brand-grid') {
  await page.waitForFunction(selector => !!document.querySelector(selector), selector)
  return page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 900
    const c = canvas.getContext('2d')
    c.fillStyle = '#b18d54'; c.fillRect(0, 0, 800, 900)
    c.fillStyle = '#51483c'; c.fillRect(800, 0, 800, 900)
    return canvas.toDataURL('image/jpeg').split(',')[1]
  })
}
async function upload(page, buffer, label = 'Выбрать фотографию') {
  await page.getByLabel(label, { exact: true }).setInputFiles({
    name: 'tea.jpg', mimeType: 'image/jpeg', buffer,
  })
  await page.getByRole('region', { name: 'Квадратное кадрирование' }).waitFor()
  await page.getByRole('button', { name: 'Использовать фото' }).waitFor({ state: 'visible' })
}
async function finishCrop(page) {
  await page.getByRole('button', { name: 'Использовать фото' }).click()
  await page.getByRole('region', { name: 'Квадратное кадрирование' }).waitFor({ state: 'hidden' })
}
async function state(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('tea-collection', 1)
    request.onsuccess = () => {
      const db = request.result
      const query = db.transaction('album').objectStore('album').get('collection')
      query.onsuccess = () => { db.close(); resolve(query.result) }
      query.onerror = () => reject(query.error)
    }
  }))
}
async function openSettings(page) {
  if (await page.getByRole('link', { name: 'Все коллекции' }).count()) await back(page)
  await page.getByRole('button', { name: 'Настройки', exact: true }).click()
}

test('new user book, brand covers, square cropping, grid flips, editing and backup roundtrip', { timeout: 90000 }, async t => {
  const { context, url } = await fixture(t)
  const page = await context.newPage()
  const failures = []
  page.on('pageerror', error => failures.push(error.message))
  await page.goto(url)
  await bookLid(page).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true)
  assert.equal((await state(page)).categories.length, 5)
  assert.deepEqual((await state(page)).categories.map(category => category.name), ['Curtis', 'Greenfield', 'Tess', 'Ahmad Tea', 'Richard'])
  const cover = page.locator('.book-cover')
  const angle = () => cover.evaluate(node => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform)
    return Math.atan2(matrix.m31, matrix.m11) * 180 / Math.PI
  })
  await openBook(page)
  await poll(async () => (await angle()) < -10 && (await angle()) > -160)
  await poll(async () => (await angle()) < -162)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), true)
  await page.getByRole('button', { name: 'Закрыть книгу' }).click()
  await poll(async () => Math.abs(await angle()) < .1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openBook(page)
  assert.equal(await page.locator('.brand-placeholder').count(), 5)
  assert.equal(await page.locator('.brand-card img').count(), 0)

  const inputPhoto = Buffer.from(await photo(page), 'base64')
  await page.locator('.new-brand').click()
  const longName = 'Моя коллекция редких чаёв с очень длинным названием'
  await page.getByLabel('Название коллекции').fill(longName)
  await upload(page, inputPhoto, 'Фотография обложки')
  await page.getByLabel('Масштаб', { exact: true }).fill('1.4')
  await page.getByLabel('По горизонтали', { exact: true }).fill('.35')
  await finishCrop(page)
  await page.getByRole('button', { name: 'Создать коллекцию', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  await brand(page, longName).waitFor()
  let stored = await state(page)
  let custom = stored.categories.at(-1)
  assert.match(custom.photo, /^data:image\/jpeg/)
  assert.match(custom.sourcePhoto, /^data:image\/jpeg/)
  const firstCover = custom.photo
  await editBrand(page, longName)
  await page.getByLabel('Название коллекции').fill('Моя коллекция')
  await page.getByRole('button', { name: 'Кадрирование', exact: true }).click()
  await page.getByLabel('По горизонтали', { exact: true }).fill('-.6')
  await finishCrop(page)
  await page.getByRole('button', { name: 'Сохранить коллекцию', exact: true }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  custom = (await state(page)).categories.at(-1)
  assert.notEqual(custom.photo, firstCover)
  assert.equal(custom.name, 'Моя коллекция')
  await editBrand(page, 'Моя коллекция')
  await page.getByRole('button', { name: 'Убрать фотографию' }).click()
  await page.getByRole('button', { name: 'Сохранить коллекцию' }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  assert.equal((await state(page)).categories.at(-1).photo, '')
  await editBrand(page, 'Моя коллекция')
  await upload(page, inputPhoto, 'Фотография обложки')
  await finishCrop(page)
  await page.getByRole('button', { name: 'Сохранить коллекцию' }).click()
  await dialog(page).waitFor({ state: 'hidden' })

  await brand(page, 'Curtis').click()
  await page.getByRole('heading', { name: 'Curtis', exact: true }).waitFor()
  assert.equal(await page.locator('.package-slot').count(), 8)
  assert.equal((await state(page)).teas.length, 0)
  assert.equal(await page.getByRole('button', { name: 'Настройки', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Добавить первый чай' }).click()
  await page.getByLabel('Название чая').fill('Curtis Blue Berries')
  await page.getByRole('button', { name: 'Добавить в коллекцию' }).click()
  await alert(page).filter({ hasText: 'Выберите фотографию' }).waitFor()
  await upload(page, inputPhoto)
  const crop = page.locator('.crop-overlay canvas')
  const cropBounds = await crop.boundingBox()
  await page.mouse.move(cropBounds.x + 120, cropBounds.y + 120)
  await page.mouse.down()
  await page.mouse.move(cropBounds.x + 160, cropBounds.y + 140, { steps: 6 })
  await page.mouse.up()
  assert.notEqual(await page.getByLabel('По горизонтали', { exact: true }).inputValue(), '0')
  await page.getByLabel('Масштаб', { exact: true }).fill('1.2')
  await finishCrop(page)
  await page.getByRole('button', { name: 'Оценка 4 из 5' }).click()
  await page.getByLabel('Описание', { exact: true }).fill('А'.repeat(170))
  assert.equal((await page.getByLabel('Описание', { exact: true }).inputValue()).length, 150)
  await page.getByText('150 / 150', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Добавить в коллекцию' }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  const record = (await state(page)).teas[0]
  assert.equal(record.notes.length, 150)
  assert.equal(record.rating, 4)
  assert.ok(record.sourcePhoto)
  const dimensions = await page.getByAltText('Curtis Blue Berries', { exact: true }).evaluate(async image => {
    await image.decode(); return [image.naturalWidth, image.naturalHeight]
  })
  assert.deepEqual(dimensions, [1080, 1080])
  const first = page.locator('.package-toggle').first()
  await first.tap()
  assert.equal(await first.getAttribute('aria-pressed'), 'true')
  await first.tap()
  assert.equal(await first.getAttribute('aria-pressed'), 'false')
  await page.getByRole('button', { name: 'Редактировать чай — Curtis Blue Berries', exact: true }).click()
  await page.getByLabel('Название чая').fill('Curtis Berries')
  await page.getByRole('button', { name: 'Кадрирование', exact: true }).click()
  await page.getByLabel('По вертикали', { exact: true }).fill('.6')
  await page.getByLabel('Масштаб', { exact: true }).fill('1.6')
  await finishCrop(page)
  await page.getByRole('button', { name: 'Оценка 5 из 5' }).click()
  await page.getByLabel('Описание', { exact: true }).fill('Ягодный вкус')
  await page.getByRole('button', { name: 'Сохранить изменения' }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  assert.notEqual((await state(page)).teas[0].photo, record.photo)
  assert.equal((await state(page)).teas[0].sourcePhoto, record.sourcePhoto)

  const portraitPhoto = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 1600
    const context = canvas.getContext('2d')
    context.fillStyle = '#c6b693'; context.fillRect(0, 0, 900, 1600)
    context.fillStyle = '#705b3b'; context.fillRect(0, 800, 900, 800)
    return canvas.toDataURL('image/jpeg').split(',')[1]
  }), 'base64')
  // Add several real records through the same form.
  for (let i = 2; i <= 9; i++) {
    await page.getByRole('button', { name: 'Добавить', exact: true }).click()
    await page.getByLabel('Название чая').fill('Чай № ' + i)
    await upload(page, i === 2 ? portraitPhoto : inputPhoto)
    await finishCrop(page)
    await page.getByRole('button', { name: 'Оценка ' + (i % 5 + 1) + ' из 5' }).click()
    await page.getByRole('button', { name: 'Добавить в коллекцию' }).click()
    await dialog(page).waitFor({ state: 'hidden' })
  }
  assert.equal(await page.locator('.package-toggle').count(), 9)
  const originals = (await state(page)).teas.map(tea => tea.sourcePhoto)
  const orientations = await page.evaluate(async originals => Promise.all(originals.slice(0, 2).map(async src => {
    const image = new Image()
    image.src = src
    await image.decode()
    return image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait'
  })), originals)
  assert.deepEqual(orientations, ['landscape', 'portrait'])
  await page.locator('.package-toggle').nth(1).tap()
  assert.equal(await page.locator('.package-toggle').nth(1).getAttribute('aria-pressed'), 'true')
  assert.equal(await first.getAttribute('aria-pressed'), 'false')
  await page.locator('.package-toggle').nth(1).tap()
  const viewport = page.viewportSize()
  for (const [width, height] of [[320,568],[375,667],[390,844],[402,874],[440,956]]) {
    await page.setViewportSize({width,height})
    assert.ok(await page.locator('.package-grid').evaluate(grid => {
      const slots = [...grid.querySelectorAll('.package-slot')]
      return getComputedStyle(grid).gridTemplateColumns.split(' ').length === 2 &&
        document.documentElement.scrollWidth === innerWidth &&
        slots.every(slot => {
          const box = slot.getBoundingClientRect()
          return Math.abs(box.width - box.height) < 1 && box.width >= 120
        }) && [...document.querySelectorAll('.journal-icon')].every(button => button.clientWidth >= 44 && button.clientHeight >= 44)
    }), width + ' × ' + height)
    if (height >= 844) {
      assert.ok(await page.locator('.package-slot').nth(7).evaluate(node => node.getBoundingClientRect().bottom <= innerHeight + 1))
    }
  }
  await page.setViewportSize(viewport)
  await page.evaluate(() => scrollTo(0, 0))
  const cdp = await context.newCDPSession(page)
  const box = await first.boundingBox()
  const touchX = Math.round(box.x + box.width / 2)
  const touchY = Math.round(box.y + box.height / 2)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] })
  for (const offset of [20, 50, 100]) await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: touchX, y: touchY - offset }],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await poll(() => page.evaluate(() => scrollY > 0))
  assert.equal(await first.getAttribute('aria-pressed'), 'false')
  await page.locator('.package-toggle').last().scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(() => scrollY > 0))
  await page.reload()
  await page.locator('.package-toggle').last().waitFor()
  assert.equal(await page.locator('.package-toggle').count(), 9)

  await openSettings(page)
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспорт коллекции' }).click()
  const download = await downloading
  const backup = await readFile(await download.path())
  const data = JSON.parse(backup)
  assert.equal(data.version, 2)
  assert.equal(data.teas.length, 9)
  assert.ok(data.categories.at(-1).photo && data.categories.at(-1).sourcePhoto)
  assert.ok(data.teas.every(tea => tea.photo && tea.sourcePhoto))
  await close(page)
  await brand(page, 'Curtis').click()
  await page.getByRole('button', { name: 'Редактировать чай — Curtis Berries', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить чай', exact: true }).click()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  assert.equal((await state(page)).teas.length, 9)
  await page.getByRole('button', { name: 'Редактировать чай — Curtis Berries', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить чай', exact: true }).click()
  await page.getByRole('button', { name: 'Удалить', exact: true }).click()
  await dialog(page).waitFor({state:'hidden'})
  assert.equal((await state(page)).teas.length, 8)
  await openSettings(page)
  await attach(page, 'backup.json', backup)
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click()
  await dialog(page).waitFor({state:'hidden'})
  const restored = await state(page)
  assert.deepEqual(restored, {categories:data.categories,teas:data.teas})
  await editBrand(page, 'Curtis')
  await page.getByRole('button', { name: 'Удалить коллекцию' }).click()
  await page.getByRole('button', { name: 'Отмена', exact: true }).click()
  assert.equal((await state(page)).teas.length, 9)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await context.setOffline(true)
  await page.reload()
  await openBook(page)
  await brand(page, 'Моя коллекция').getByRole('img').evaluate(image => image.decode())
  await brand(page, 'Curtis').click()
  await page.getByAltText('Curtis Berries').evaluate(image => image.decode())
  assert.equal(await page.locator('.package-toggle').count(), 9)
  assert.deepEqual(failures, [])
})

test('legacy v1 data survives update, old backups, corrupt covers and failed atomic restore', { timeout: 50000 }, async t => {
  const {context,host,url} = await fixture(t)
  const page = await context.newPage()
  await page.goto(host)
  const legacyPhoto = 'data:image/jpeg;base64,' + (await readFile('public/sencha.jpg')).toString('base64')
  const legacy = {
    categories:[{id:'tea-0',name:'Зелёный чай',cover:0},{id:'custom',name:'Старинная подборка',cover:3}],
    teas:[{id:'old',category:'tea-0',name:'Старый чай',photo:legacyPhoto,notes:'Длинная заметка. '.repeat(40),rating:3,added:'2025-10-12',tasted:''}],
  }
  await page.evaluate(collection => new Promise((done,fail) => {
    const request = indexedDB.open('tea-collection',1)
    request.onupgradeneeded = () => request.result.createObjectStore('album').put(collection,'collection')
    request.onsuccess = () => { request.result.close(); done() }
    request.onerror = () => fail(request.error)
  }),legacy)
  await page.goto(url)
  await openBook(page)
  assert.deepEqual(await state(page),legacy)
  await brand(page,'Зелёный чай').click()
  assert.equal(await page.getByAltText('Старый чай').getAttribute('src'),legacyPhoto)
  await page.getByRole('button',{name:'Редактировать чай — Старый чай'}).click()
  await page.getByLabel('Название чая').fill('Старый чай, уточнение')
  await page.getByRole('button',{name:'Сохранить изменения'}).click()
  await dialog(page).waitFor({state:'hidden'})
  assert.equal((await state(page)).teas[0].notes, legacy.teas[0].notes)
  const stale = await context.newPage()
  await stale.goto(page.url())
  await stale.getByRole('button',{name:'Редактировать чай — Старый чай, уточнение'}).click()
  await page.getByRole('button',{name:'Редактировать чай — Старый чай, уточнение'}).click()
  await page.getByLabel('Название чая').fill('Сохранённый чай')
  await page.getByRole('button',{name:'Сохранить изменения'}).click()
  await dialog(page).waitFor({state:'hidden'})
  await stale.getByLabel('Название чая').fill('Устаревшее изменение')
  await stale.getByRole('button',{name:'Сохранить изменения'}).click()
  await alert(stale).filter({hasText:'изменилась в другом окне'}).waitFor()
  await stale.close()
  const saved = await state(page)
  await openSettings(page)
  const folder = await mkdtemp(join(tmpdir(),'tea-v2-test-'))
  t.after(() => rm(folder,{recursive:true,force:true}))
  const tooLarge = join(folder,'large.json')
  await writeFile(tooLarge,'')
  await truncate(tooLarge,64*1024*1024+1)
  await dialog(page).locator('input[type=file]').setInputFiles(tooLarge)
  await alert(page).filter({hasText:'64 МиБ'}).waitFor()
  await attach(page,'bad.json',Buffer.from('{'))
  await alert(page).filter({hasText:'не является корректной'}).waitFor()
  const badCover = {version:2,...legacy,categories:[{...legacy.categories[0],photo:'data:image/jpeg;base64,/9hzdHVi/9k='}]}
  await attach(page,'bad-cover.json',Buffer.from(JSON.stringify(badCover)))
  await alert(page).filter({hasText:'не является корректной'}).waitFor()
  assert.deepEqual(await state(page),saved)
  await page.evaluate(() => {
    const original=FileReader.prototype.readAsText
    FileReader.prototype.readAsText=function() {
      FileReader.prototype.readAsText=original
      throw new DOMException('Failed to read','NotReadableError')
    }
  })
  const backup = Buffer.from(JSON.stringify({version:1,...legacy}))
  await attach(page,'old.json',backup)
  await alert(page).filter({hasText:'Не удалось прочитать'}).waitFor()
  await attach(page,'old.json',backup)
  await page.getByRole('heading',{name:'Восстановить коллекцию?'}).waitFor()
  await page.evaluate(() => {
    const put=IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put=function(value,key) {
      put.call(this,value,key)
      if(key==='collection') throw new DOMException('Disk full','QuotaExceededError')
    }
  })
  await page.getByRole('button',{name:'Восстановить',exact:true}).click()
  await alert(page).filter({hasText:'Хранилище заполнено'}).waitFor()
  await page.reload()
  await openBook(page)
  assert.deepEqual(await state(page),saved)
  await openSettings(page)
  await attach(page,'old.json',backup)
  await page.getByRole('button',{name:'Восстановить',exact:true}).click()
  await dialog(page).waitFor({state:'hidden'})
  assert.deepEqual(await state(page),legacy)
  await editBrand(page,'Зелёный чай')
  await page.getByRole('button',{name:'Удалить коллекцию'}).click()
  await page.getByRole('button',{name:'Удалить',exact:true}).click()
  await dialog(page).waitFor({state:'hidden'})
  assert.equal((await state(page)).teas.length,0)
  assert.deepEqual((await state(page)).categories,[legacy.categories[1]])
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
  await bookLid(first).waitFor()
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
  await bookLid(second).waitFor()
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
  await bookLid(updated).waitFor()
  assert.equal(await updated.locator('html').getAttribute('data-release'), 'next')
  const manifest = await updated.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]')
    const content = await (await fetch(link.href)).json()
    return { scope: new URL(content.scope, link.href).pathname,
      icons: await Promise.all(content.icons.map(async icon => (await fetch(new URL(icon.src, link.href))).ok)) }
  })
  assert.deepEqual(manifest, { scope, icons: [true, true] })
})
