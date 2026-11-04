// Próxima versão a publicar quando algo entra na main: a do package.json com o número do beta logo acima do maior
// já publicado (ou rascunho) com o mesmo começo. Ex.: package.json 0.2.0-beta.2 e releases até beta.7 → 0.2.0-beta.8.
// Uso: node next-version.mjs <versão do package.json> <tags, uma por linha, na entrada padrão>
import { readFileSync } from 'node:fs'

export function nextVersion(current, tags) {
  const match = /^(\d+\.\d+\.\d+-[a-z]+\.)(\d+)$/.exec(current)
  if (!match) throw new Error(`versão sem número de beta: ${current}`)
  const [, prefix, number] = match
  let highest = Number(number)
  for (const tag of tags) {
    const name = tag.trim().replace(/^v/, '')
    if (!name.startsWith(prefix)) continue
    const n = Number(name.slice(prefix.length))
    if (Number.isInteger(n) && n > highest) highest = n
  }
  return `${prefix}${highest + 1}`
}

if (process.argv[2]) {
  const tags = readFileSync(0, 'utf8').split('\n').filter(Boolean)
  console.log(nextVersion(process.argv[2], tags))
}
