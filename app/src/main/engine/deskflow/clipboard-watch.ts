/**
 * Windows e Mac: um observador leve (PowerShell; JavaScript do próprio macOS) olha a área de transferência a cada
 * meio segundo, só enquanto o mouse está compartilhado. A cada cópia imprime uma linha: `F` e os arquivos copiados
 * (separados por |), `I` e o arquivo .png de uma imagem copiada (salva na pasta HZ_CLIP_DIR), ou vazia (outra coisa).
 */
export const WATCH_WINDOWS = [
  'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
  `Add-Type -Namespace Hz -Name Clip -MemberDefinition '[DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();'`,
  '$seq = 0; $n = 0',
  'while ($true) {',
  '  $now = [Hz.Clip]::GetClipboardSequenceNumber()',
  '  if ($now -ne $seq) {',
  "    $seq = $now; $line = ''",
  '    try {',
  "      $files = @((Get-Clipboard -Format FileDropList -ErrorAction SilentlyContinue).FullName) -join '|'",
  "      if ($files) { $line = 'F' + $files }",
  '      elseif ([Windows.Forms.Clipboard]::ContainsImage()) {',
  '        $n++; $path = Join-Path $env:HZ_CLIP_DIR "imagem-$n.png"',
  '        [Windows.Forms.Clipboard]::GetImage().Save($path, [Drawing.Imaging.ImageFormat]::Png)',
  "        $line = 'I' + $path",
  '      }',
  '    } catch { }',
  '    [Console]::Out.WriteLine($line); [Console]::Out.Flush()',
  '  }',
  '  Start-Sleep -Milliseconds 500',
  '}'
].join('\n')

export const WATCH_MAC = `
ObjC.import('AppKit')
const pb = $.NSPasteboard.generalPasteboard
const dir = $.NSProcessInfo.processInfo.environment.objectForKey('HZ_CLIP_DIR').js
const out = $.NSFileHandle.fileHandleWithStandardOutput
let seen = -1, n = 0
while (true) {
  const count = pb.changeCount
  if (count !== seen) {
    seen = count
    let line = ''
    try {
      const urls = pb.readObjectsForClassesOptions($([$.NSURL]), $({ NSPasteboardURLReadingFileURLsOnlyKey: true }))
      const paths = urls.isNil() ? [] : ObjC.unwrap(urls).map((url) => url.path.js)
      if (paths.length) line = 'F' + paths.join('|')
      else {
        let png = pb.dataForType('public.png')
        const tiff = pb.dataForType('public.tiff')
        if (png.isNil() && !tiff.isNil()) png = $.NSBitmapImageRep.imageRepWithData(tiff).representationUsingTypeProperties(4, $({}))
        if (!png.isNil()) {
          n++
          const path = dir + '/imagem-' + n + '.png'
          if (png.writeToFileAtomically(path, true)) line = 'I' + path
        }
      }
    } catch (error) {}
    out.writeData($(line + '\\n').dataUsingEncoding($.NSUTF8StringEncoding))
  }
  delay(0.5)
}
`

/** Põe arquivos (ou, com "image", a imagem de um arquivo) na área de transferência do Mac. */
export const PLACE_MAC = `
ObjC.import('AppKit')
function run(argv) {
  const image = argv[0] === 'image'
  const items = argv.slice(1).map((path) =>
    image ? $.NSImage.alloc.initWithContentsOfFile(path) : $.NSURL.fileURLWithPath(path))
  const pb = $.NSPasteboard.generalPasteboard
  pb.clearContents
  pb.writeObjects($(items))
}
`

/** O que o observador imprimiu, em arquivos copiados (com `image` quando é uma imagem). */
export function parseWatchLine(raw: string): { paths: string[]; image: boolean } {
  const line = raw.trim()
  const kind = line[0]
  const rest = line.slice(1)
  if (kind === 'I' && rest) return { paths: [rest], image: true }
  if (kind === 'F' && rest) return { paths: rest.split('|').filter(Boolean), image: false }
  return { paths: [], image: false }
}
