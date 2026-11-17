const source = 'https://commons.wikimedia.org/wiki/File:'
const licenses = 'https://creativecommons.org/licenses/'
const photos = [
  { name: 'Зелёный чай', file: 'Dried jakseol green tea leaves.jpg', author: '예향',
    license: 'CC BY 2.0 KR', licenseUrl: licenses + 'by/2.0/kr/' },
  { name: 'Чёрный чай', file: 'Darjeeling-tea-first-flush-in-cup.jpg', author: 'David J. Fred',
    license: 'CC BY-SA 2.5', licenseUrl: licenses + 'by-sa/2.5/' },
  { name: 'Белый чай', file: 'Байхао Иньчжэнь.jpg', author: 'Pannet',
    license: 'CC BY-SA 4.0', licenseUrl: licenses + 'by-sa/4.0/' },
  { name: 'Улун', file: 'Jin Xuan oolong tea steeping in gaiwan.jpg', author: 'Difference engine',
    license: 'CC BY-SA 4.0', licenseUrl: licenses + 'by-sa/4.0/' },
  { name: 'Пуэр', file: 'Yunnan Sourcing "Golden Pig" Raw Pu-erh Tea Cake - opened - WikiTea 01.jpg', author: 'Ash Crow',
    license: 'CC BY-SA 4.0', licenseUrl: licenses + 'by-sa/4.0/' },
  { name: 'Травяной чай', file: 'Loose chamomile tea.jpg', author: 'Ehedaya',
    license: 'Общественное достояние', licenseUrl: null },
]

export function PhotoCredits() {
  return <details className="photo-credits">
    <summary>Авторы фото</summary>
    <ul>
      {photos.map(({ name, file, author, license, licenseUrl }) =>
        <li key={file}>{name} · <a href={source + encodeURIComponent(file.replaceAll(' ', '_'))}>{file}</a> · {author} ·{' '}
          {licenseUrl ? <a href={licenseUrl}>{license}</a> : license}</li>)}
      <li>Фотографии кадрированы и сохранены в WebP. Лицензии исходных кадров распространяются на эти версии.</li>
    </ul>
  </details>
}
