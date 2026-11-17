import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const files = (await readdir('dist', { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name !== 'sw.js')
  .map(entry => entry.parentPath.replaceAll('\\', '/').slice(4) + '/' + entry.name)
  .map(path => '.' + path).sort()
const version = createHash('sha256').update(await readFile('scripts/sw.mjs'))
for (const path of files) {
  const contents = await readFile('dist/' + path)
  version.update(JSON.stringify([path, contents.length])).update(contents)
}
await writeFile('dist/sw.js', `
const prefix = 'tea-collection:' + self.registration.scope + ':'
const cacheName = prefix + '${version.digest('hex').slice(0, 16)}'
const shell = new URL('./index.html', self.registration.scope).href
self.addEventListener('install', event => event.waitUntil(
  caches.open(cacheName).then(cache => cache.addAll(
    ${JSON.stringify(files)}.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }))
  )).catch(async error => {
    await caches.delete(cacheName)
    throw error
  })
))
self.addEventListener('activate', event => event.waitUntil(
  // With no skipWaiting, activation starts only after the previous clients are gone.
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== cacheName &&
    (key.startsWith(prefix) || (new URL(self.registration.scope).pathname === '/tea-collection/' &&
      /^tea-collection-[0-9a-f]{16}$/.test(key))))
    .map(key => caches.delete(key)))).then(() => self.clients.claim())
))
self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return
  event.respondWith(caches.open(cacheName).then(async cache => {
    if (request.mode === 'navigate') return (await cache.match(shell, { ignoreVary: true })) || fetch(request)
    return (await cache.match(request, { ignoreVary: true })) || fetch(request)
  }))
})
`)