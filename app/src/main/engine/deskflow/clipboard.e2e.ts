import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { describe, expect, it } from 'vitest'
import { parseWatchLine, PLACE_MAC, WATCH_MAC, WATCH_WINDOWS } from './clipboard-watch'

/** Uma imagem PNG de verdade, 1 por 1 pixel. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
const windows = process.platform === 'win32'
const mac = process.platform === 'darwin'

/** O observador de verdade, e uma espera pela próxima linha que ele imprimir com conteúdo. */
function watcher(dir: string): { next(): Promise<string>; stop(): void } {
  const env = { ...process.env, HZ_CLIP_DIR: dir }
  const child = windows
    ? spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-Command', WATCH_WINDOWS],
        { env }
      )
    : spawn('osascript', ['-l', 'JavaScript', '-e', WATCH_MAC], { env })
  const waiting: ((line: string) => void)[] = []
  let errors = ''
  child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()))
  child.on('exit', (code) => (errors += ` (saiu: ${code})`))
  createInterface({ input: child.stdout }).on('line', (line) => {
    if (line.trim()) waiting.shift()?.(line)
  })
  return {
    next: () =>
      new Promise((resolve, reject) => {
        waiting.push(resolve)
        setTimeout(() => reject(new Error(`o observador não avisou a cópia: ${errors}`)), 30_000)
      }),
    stop: () => void child.kill()
  }
}

function place(paths: string[], image: boolean): void {
  if (mac) {
    execFileSync('osascript', [
      '-l',
      'JavaScript',
      '-e',
      PLACE_MAC,
      image ? 'image' : 'files',
      ...paths
    ])
    return
  }
  const quoted = paths.map((path) => `'${path}'`).join(',')
  const script = image
    ? `Add-Type -AssemblyName System.Windows.Forms, System.Drawing; [Windows.Forms.Clipboard]::SetImage([Drawing.Image]::FromFile(${quoted}))`
    : `Set-Clipboard -Path ${quoted}`
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script])
}

describe.runIf(windows || mac)('copiar e colar arquivos e imagens (observador do sistema)', () => {
  it('avisa arquivos copiados e salva a imagem copiada em .png', async () => {
    // Caminho longo e real: no Mac /var é /private/var; no Windows, sem o nome curto RUNNER~1.
    const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'hz-clip-')))
    const file = join(dir, 'relatorio.txt')
    const image = join(dir, 'origem.png')
    writeFileSync(file, 'oi')
    writeFileSync(image, PNG)
    const watch = watcher(dir)
    try {
      // A primeira linha é o que já estava copiado; a seguir, as cópias deste teste.
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const filesLine = watch.next()
      place([file], false)
      const files = parseWatchLine(await filesLine)
      expect(files.image).toBe(false)
      expect(files.paths.map((path) => path.toLowerCase())).toContain(file.toLowerCase())

      const imageLine = watch.next()
      place([image], true)
      const copied = parseWatchLine(await imageLine)
      expect(copied.image).toBe(true)
      expect(readFileSync(copied.paths[0]!).subarray(1, 4).toString()).toBe('PNG')
    } finally {
      watch.stop()
    }
  })
})
