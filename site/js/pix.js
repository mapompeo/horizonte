// Apoiar: uma janelinha com o Pix (QR code e copia e cola) e o GitHub Sponsors. Sem chave Pix, o botão só abre o
// Sponsors, como um link comum.

// A chave Pix de quem recebe (e-mail, telefone com +55, CPF/CNPJ ou chave aleatória).
export const PIX_KEY = 'matheuspompeo13@gmail.com'

const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`

/** CRC16-CCITT (polinômio 0x1021, começa em 0xFFFF), como o Banco Central pede no fim do código. */
export function crc16(text) {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** O "Pix copia e cola" estático (BR Code), sem valor: quem paga escolhe quanto. */
export function pixPayload(key, name = 'HORIZONTE', city = 'BRASIL') {
  const body =
    field('00', '01') +
    field('26', field('00', 'br.gov.bcb.pix') + field('01', key)) +
    field('52', '0000') +
    field('53', '986') +
    field('58', 'BR') +
    field('59', name.slice(0, 25)) +
    field('60', city.slice(0, 15)) +
    field('62', field('05', '***')) +
    '6304'
  return body + crc16(body)
}

export async function mountSupport(key = PIX_KEY) {
  const dialog = document.getElementById('apoio')
  if (!key || !dialog?.showModal) return
  const code = pixPayload(key)
  const { default: qrcode } = await import('../vendor/qrcode.mjs')
  const qr = qrcode(0, 'M')
  qr.addData(code)
  qr.make()
  document.getElementById('apoio-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true })
  const copy = document.getElementById('apoio-copy')
  copy.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(code).catch(() => undefined)
    const label = copy.textContent
    copy.textContent = globalThis.hzT?.('ap.copied', 'Copiado') ?? 'Copiado'
    setTimeout(() => (copy.textContent = label), 1800)
  })
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close())
  for (const link of document.querySelectorAll('a.support'))
    link.addEventListener('click', (e) => {
      e.preventDefault()
      dialog.showModal()
    })
}
