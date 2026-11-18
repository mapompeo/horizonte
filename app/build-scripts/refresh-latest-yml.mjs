// Depois de assinar o instalador do Windows, o arquivo muda: o latest.yml (que o app baixa para conferir a versão nova)
// precisa do sha512 e do tamanho do instalador assinado, senão a atualização automática recusa o download.
// Uso: node build-scripts/refresh-latest-yml.mjs dist/latest.yml dist/Horizonte-X-setup.exe
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Troca o sha512 e o tamanho do arquivo `name` (na lista e no topo, quando ele é o `path`). Devolve o texto novo. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- script .mjs da CI, sem tipos
export function refreshLatest(yml, name, { sha512, size }) {
  const lines = yml.split('\n')
  let inEntry = false
  let topLevelIsIt = false
  let touched = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*-\s+url:\s*/.test(line)) inEntry = line.replace(/^\s*-\s+url:\s*/, '').trim() === name
    else if (/^\S/.test(line)) inEntry = false
    if (/^path:\s*/.test(line)) topLevelIsIt = line.replace(/^path:\s*/, '').trim() === name
    if (inEntry && /^\s+sha512:/.test(line)) {
      lines[i] = line.replace(/sha512:.*/, `sha512: ${sha512}`)
      touched = true
    } else if (inEntry && /^\s+size:/.test(line))
      lines[i] = line.replace(/size:.*/, `size: ${size}`)
  }
  for (let i = 0; i < lines.length; i++)
    if (topLevelIsIt && /^sha512:/.test(lines[i])) lines[i] = `sha512: ${sha512}`
  if (!touched) throw new Error(`O latest.yml não lista ${name}.`)
  return lines.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [yml, file] = process.argv.slice(2)
  const sha512 = createHash('sha512').update(readFileSync(file)).digest('base64')
  writeFileSync(
    yml,
    refreshLatest(readFileSync(yml, 'utf8'), basename(file), { sha512, size: statSync(file).size })
  )
  console.log(`latest.yml com o hash do ${basename(file)} assinado`)
}
