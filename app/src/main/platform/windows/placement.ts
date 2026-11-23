import type { ExtendSide, MouseSide } from '../../../shared/types'

/**
 * Reposiciona o monitor virtual (VDD, código de monitor MTT1337) ao lado dos monitores de verdade, sem
 * administrador: lê as posições atuais e grava só a do virtual (ChangeDisplaySettingsEx com DM_POSITION).
 * Imprime "ok", "ja" (já estava no lugar) ou "sem-virtual".
 */
/** As chamadas do Windows que mexem nas telas (DEVMODE e ChangeDisplaySettingsEx). */
const HEADER = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class HzPlace {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DISPLAY_DEVICE {
    public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString; public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName; public short dmSpecVersion;
    public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName; public short dmLogPixels;
    public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags;
    public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent; public int dmMediaType;
    public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE d, uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettingsEx(string dev, ref DEVMODE dm, IntPtr hwnd, uint flags, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int ChangeDisplaySettingsEx(string dev, IntPtr dm, IntPtr hwnd, uint flags, IntPtr param);
}
'@
`

export function placementScript(side: ExtendSide): string {
  return `
${HEADER}$virtual = $null; $others = @()
for ($i = 0; $i -lt 32; $i++) {
  $a = New-Object HzPlace+DISPLAY_DEVICE; $a.cb = [Runtime.InteropServices.Marshal]::SizeOf($a)
  # [NullString]::Value: o PowerShell troca $null por texto vazio, e a API então não lista nada.
  if (-not [HzPlace]::EnumDisplayDevices([NullString]::Value, $i, [ref]$a, 0)) { break }
  if (($a.StateFlags -band 1) -eq 0) { continue }
  $m = New-Object HzPlace+DISPLAY_DEVICE; $m.cb = [Runtime.InteropServices.Marshal]::SizeOf($m)
  [void][HzPlace]::EnumDisplayDevices($a.DeviceName, 0, [ref]$m, 0)
  $dm = New-Object HzPlace+DEVMODE; $dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
  if (-not [HzPlace]::EnumDisplaySettings($a.DeviceName, -1, [ref]$dm)) { continue }
  $entry = [pscustomobject]@{ Name = $a.DeviceName; Mode = $dm }
  if ($m.DeviceID -match 'MTT1337') { $virtual = $entry } else { $others += $entry }
}
if (-not $virtual -or $others.Count -eq 0) { 'sem-virtual'; exit 0 }
$left = ($others | ForEach-Object { $_.Mode.dmPositionX } | Measure-Object -Minimum).Minimum
$right = ($others | ForEach-Object { $_.Mode.dmPositionX + $_.Mode.dmPelsWidth } | Measure-Object -Maximum).Maximum
$top = ($others | ForEach-Object { $_.Mode.dmPositionY } | Measure-Object -Minimum).Minimum
$dm = $virtual.Mode
switch ('${side}') {
  'left' { $x = $left - $dm.dmPelsWidth; $y = $top }
  'above' { $x = $left; $y = $top - $dm.dmPelsHeight }
  default { $x = $right; $y = $top }
}
if ($dm.dmPositionX -eq $x -and $dm.dmPositionY -eq $y) { 'ja'; exit 0 }
$dm.dmPositionX = $x; $dm.dmPositionY = $y; $dm.dmFields = 0x20
# CDS_UPDATEREGISTRY | CDS_NORESET: grava e só aplica no fim, tudo de uma vez.
$r = [HzPlace]::ChangeDisplaySettingsEx($virtual.Name, [ref]$dm, [IntPtr]::Zero, 0x10000001, [IntPtr]::Zero)
if ($r -ne 0) { throw "ChangeDisplaySettingsEx: $r" }
[void][HzPlace]::ChangeDisplaySettingsEx([NullString]::Value, [IntPtr]::Zero, [IntPtr]::Zero, 0, [IntPtr]::Zero)
'ok'
`
}

/** Acha o monitor virtual (driver MTT1337) e as telas de verdade ativas, com a posição e o tamanho de cada uma. */
const FIND = `$virtual = $null; $others = @()
for ($i = 0; $i -lt 32; $i++) {
  $a = New-Object HzPlace+DISPLAY_DEVICE; $a.cb = [Runtime.InteropServices.Marshal]::SizeOf($a)
  if (-not [HzPlace]::EnumDisplayDevices([NullString]::Value, $i, [ref]$a, 0)) { break }
  if (($a.StateFlags -band 1) -eq 0) { continue }
  $m = New-Object HzPlace+DISPLAY_DEVICE; $m.cb = [Runtime.InteropServices.Marshal]::SizeOf($m)
  [void][HzPlace]::EnumDisplayDevices($a.DeviceName, 0, [ref]$m, 0)
  $dm = New-Object HzPlace+DEVMODE; $dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
  if (-not [HzPlace]::EnumDisplaySettings($a.DeviceName, -1, [ref]$dm)) { continue }
  $entry = [pscustomobject]@{ Name = $a.DeviceName; Mode = $dm }
  if ($m.DeviceID -match 'MTT1337' -or $a.DeviceString -match 'Virtual Display') { $virtual = $entry } else { $others += $entry }
}
`

/**
 * Só lê: o tamanho do monitor virtual e as telas de verdade, num JSON de uma linha (`{"w":..,"h":..,"others":[{x,y,w,h}]}`),
 * ou "sem-virtual". A posição em si é calculada pelo app (`place-target.ts`), que é testado.
 */
export function layoutScript(): string {
  return `${HEADER}${FIND}if (-not $virtual -or $others.Count -eq 0) { 'sem-virtual'; exit 0 }
$list = @($others | ForEach-Object { @{ x = [int]$_.Mode.dmPositionX; y = [int]$_.Mode.dmPositionY; w = [int]$_.Mode.dmPelsWidth; h = [int]$_.Mode.dmPelsHeight } })
ConvertTo-Json -Compress -Depth 4 -InputObject @{ w = [int]$virtual.Mode.dmPelsWidth; h = [int]$virtual.Mode.dmPelsHeight; others = $list }
`
}

/** Leva o monitor virtual para este canto (pixels do Windows), sem mexer no tamanho dele. Imprime "ok" ou "sem-virtual". */
export function moveScript(x: number, y: number): string {
  return `${HEADER}${FIND}if (-not $virtual) { 'sem-virtual'; exit 0 }
$dm = $virtual.Mode
$dm.dmPositionX = ${Math.round(x)}; $dm.dmPositionY = ${Math.round(y)}; $dm.dmFields = 0x20
# CDS_UPDATEREGISTRY | CDS_NORESET: grava e só aplica no fim, tudo de uma vez.
$r = [HzPlace]::ChangeDisplaySettingsEx($virtual.Name, [ref]$dm, [IntPtr]::Zero, 0x10000001, [IntPtr]::Zero)
if ($r -ne 0) { throw "ChangeDisplaySettingsEx: $r" }
[void][HzPlace]::ChangeDisplaySettingsEx([NullString]::Value, [IntPtr]::Zero, [IntPtr]::Zero, 0, [IntPtr]::Zero)
'ok'
`
}

/**
 * Liga o monitor virtual (VDD) no modo dele mais perto do tamanho pedido, encostado nas telas de verdade do lado
 * pedido, sem administrador. Imprime "tela X Y LARGURA ALTURA" (pixels do Windows) ou "sem-virtual" (driver ausente).
 */
export function attachScript(width: number, height: number, side: MouseSide): string {
  return `${HEADER}
$virtual = $null; $others = @()
for ($i = 0; $i -lt 32; $i++) {
  $a = New-Object HzPlace+DISPLAY_DEVICE; $a.cb = [Runtime.InteropServices.Marshal]::SizeOf($a)
  if (-not [HzPlace]::EnumDisplayDevices([NullString]::Value, $i, [ref]$a, 0)) { break }
  $m = New-Object HzPlace+DISPLAY_DEVICE; $m.cb = [Runtime.InteropServices.Marshal]::SizeOf($m)
  [void][HzPlace]::EnumDisplayDevices($a.DeviceName, 0, [ref]$m, 0)
  if ($m.DeviceID -match 'MTT1337' -or $a.DeviceString -match 'Virtual Display') { $virtual = $a.DeviceName; continue }
  if (($a.StateFlags -band 1) -eq 0) { continue }
  $dm = New-Object HzPlace+DEVMODE; $dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
  if ([HzPlace]::EnumDisplaySettings($a.DeviceName, -1, [ref]$dm)) { $others += $dm }
}
if (-not $virtual) { 'sem-virtual'; exit 0 }
function Hz-Virtual {
  for ($i = 0; $i -lt 32; $i++) {
    $a = New-Object HzPlace+DISPLAY_DEVICE; $a.cb = [Runtime.InteropServices.Marshal]::SizeOf($a)
    if (-not [HzPlace]::EnumDisplayDevices([NullString]::Value, $i, [ref]$a, 0)) { break }
    $m = New-Object HzPlace+DISPLAY_DEVICE; $m.cb = [Runtime.InteropServices.Marshal]::SizeOf($m)
    [void][HzPlace]::EnumDisplayDevices($a.DeviceName, 0, [ref]$m, 0)
    if ($m.DeviceID -match 'MTT1337' -or $a.DeviceString -match 'Virtual Display') { return $a.DeviceName }
  }
  $null
}
function Hz-Exact($dev) {
  for ($k = 0; $k -lt 512; $k++) {
    $dm = New-Object HzPlace+DEVMODE; $dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
    if (-not [HzPlace]::EnumDisplaySettings($dev, $k, [ref]$dm)) { return $false }
    if ($dm.dmPelsWidth -eq ${width} -and $dm.dmPelsHeight -eq ${height}) { return $true }
  }
  $false
}
# Sem o tamanho exato do aparelho, o driver ganha esse tamanho no arquivo de ajustes dele (a instalação deixa a pasta
# gravável) e recarrega pelo canal dele, aberto a qualquer usuário: sem administrador. Sem arquivo, fica o mais perto.
$cfg = 'C:\\VirtualDisplayDriver\\vdd_settings.xml'
if (-not (Hz-Exact $virtual) -and (Test-Path -LiteralPath $cfg)) {
  try {
    [xml]$hzDoc = Get-Content -Raw -LiteralPath $cfg
    $list = $hzDoc.vdd_settings.resolutions
    if (-not @($list.resolution | Where-Object { [int]$_.width -eq ${width} -and [int]$_.height -eq ${height} }).Count) {
      $node = $hzDoc.CreateElement('resolution')
      foreach ($p in @(@('width', ${width}), @('height', ${height}), @('refresh_rate', 60))) {
        $e = $hzDoc.CreateElement($p[0]); $e.InnerText = [string]$p[1]; [void]$node.AppendChild($e)
      }
      [void]$list.AppendChild($node); $hzDoc.Save($cfg)
    }
    $pipe = New-Object IO.Pipes.NamedPipeClientStream('.', 'MTTVirtualDisplayPipe', [IO.Pipes.PipeDirection]::InOut)
    $pipe.Connect(3000); $b = [Text.Encoding]::Unicode.GetBytes('RELOAD_DRIVER'); $pipe.Write($b, 0, $b.Length); $pipe.Flush(); $pipe.Dispose()
    # O driver recria o monitor: espera ele voltar já com o tamanho novo.
    for ($t = 0; $t -lt 40; $t++) {
      Start-Sleep -Milliseconds 250
      $v = Hz-Virtual
      if ($v -and (Hz-Exact $v)) { $virtual = $v; break }
    }
  } catch { }
}
# O modo do driver mais perto do pedido (a lista dele vem do próprio driver).
$best = $null; $score = [int]::MaxValue
for ($k = 0; $k -lt 512; $k++) {
  $dm = New-Object HzPlace+DEVMODE; $dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
  if (-not [HzPlace]::EnumDisplaySettings($virtual, $k, [ref]$dm)) { break }
  $d = [Math]::Abs($dm.dmPelsWidth - ${width}) + [Math]::Abs($dm.dmPelsHeight - ${height})
  if ($d -lt $score) { $best = $dm; $score = $d }
}
if (-not $best) { throw 'O monitor virtual não tem nenhum modo de tela.' }
$left = ($others | ForEach-Object { $_.dmPositionX } | Measure-Object -Minimum).Minimum
$right = ($others | ForEach-Object { $_.dmPositionX + $_.dmPelsWidth } | Measure-Object -Maximum).Maximum
$top = ($others | ForEach-Object { $_.dmPositionY } | Measure-Object -Minimum).Minimum
$bottom = ($others | ForEach-Object { $_.dmPositionY + $_.dmPelsHeight } | Measure-Object -Maximum).Maximum
switch ('${side}') {
  'left' { $x = $left - $best.dmPelsWidth; $y = $top }
  'above' { $x = $left; $y = $top - $best.dmPelsHeight }
  'below' { $x = $left; $y = $bottom }
  default { $x = $right; $y = $top }
}
$best.dmPositionX = $x; $best.dmPositionY = $y
# DM_POSITION | DM_PELSWIDTH | DM_PELSHEIGHT
$best.dmFields = 0x20 -bor 0x80000 -bor 0x100000
$r = [HzPlace]::ChangeDisplaySettingsEx($virtual, [ref]$best, [IntPtr]::Zero, 0x10000001, [IntPtr]::Zero)
if ($r -ne 0) { throw "ChangeDisplaySettingsEx: $r" }
[void][HzPlace]::ChangeDisplaySettingsEx([NullString]::Value, [IntPtr]::Zero, [IntPtr]::Zero, 0, [IntPtr]::Zero)
"tela $x $y $($best.dmPelsWidth) $($best.dmPelsHeight)"
`
}

/** Tira o monitor virtual da área de trabalho (tamanho zero), sem administrador: as janelas voltam às outras telas. */
export function detachScript(): string {
  return `${HEADER}
for ($i = 0; $i -lt 32; $i++) {
  $a = New-Object HzPlace+DISPLAY_DEVICE; $a.cb = [Runtime.InteropServices.Marshal]::SizeOf($a)
  if (-not [HzPlace]::EnumDisplayDevices([NullString]::Value, $i, [ref]$a, 0)) { break }
  $m = New-Object HzPlace+DISPLAY_DEVICE; $m.cb = [Runtime.InteropServices.Marshal]::SizeOf($m)
  [void][HzPlace]::EnumDisplayDevices($a.DeviceName, 0, [ref]$m, 0)
  if (-not ($m.DeviceID -match 'MTT1337' -or $a.DeviceString -match 'Virtual Display')) { continue }
  $dm = New-Object HzPlace+DEVMODE; $dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
  $dm.dmFields = 0x20 -bor 0x80000 -bor 0x100000
  [void][HzPlace]::ChangeDisplaySettingsEx($a.DeviceName, [ref]$dm, [IntPtr]::Zero, 0x10000001, [IntPtr]::Zero)
}
[void][HzPlace]::ChangeDisplaySettingsEx([NullString]::Value, [IntPtr]::Zero, [IntPtr]::Zero, 0, [IntPtr]::Zero)
'ok'
`
}
