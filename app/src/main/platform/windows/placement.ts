import type { ExtendSide } from '../../../shared/types'

/**
 * Reposiciona o monitor virtual (VDD, código de monitor MTT1337) ao lado dos monitores de verdade, sem
 * administrador: lê as posições atuais e grava só a do virtual (ChangeDisplaySettingsEx com DM_POSITION).
 * Imprime "ok", "ja" (já estava no lugar) ou "sem-virtual".
 */
export function placementScript(side: ExtendSide): string {
  return `
$ErrorActionPreference = 'Stop'
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
$virtual = $null; $others = @()
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
