/**
 * Roteiro do monitor virtual. Provado à mão em 03/10/2026 neste computador (Windows 11):
 * - o certificado do driver é autoassinado, então o Windows só aceita o pacote (`0x800B0109`) com ele
 *   confiado como autoridade raiz; por isso a raiz entra só durante a instalação e sai no `finally`,
 *   e só depois de a pessoa aceitar a janela de consentimento (ver `setup.ts`);
 * - o `pnputil` desta versão não tem `/add-device`: ele só põe o pacote no repositório de drivers. O
 *   monitor só aparece depois de criar o dispositivo `Root\MttVDD`, como o `devcon install` faz.
 */
const DEVICE_API = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class HzDev {
  [StructLayout(LayoutKind.Sequential)] public struct Info { public int cbSize; public Guid ClassGuid; public int DevInst; public IntPtr Reserved; }
  [DllImport("setupapi.dll", SetLastError=true)] public static extern IntPtr SetupDiCreateDeviceInfoList(ref Guid g, IntPtr h);
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SetupDiCreateDeviceInfoW(IntPtr s, string n, ref Guid g, string d, IntPtr h, int f, ref Info i);
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool SetupDiSetDeviceRegistryPropertyW(IntPtr s, ref Info i, int p, byte[] b, int n);
  [DllImport("setupapi.dll", SetLastError=true)] public static extern bool SetupDiCallClassInstaller(int f, IntPtr s, ref Info i);
  [DllImport("setupapi.dll")] public static extern bool SetupDiDestroyDeviceInfoList(IntPtr s);
  [DllImport("newdev.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool UpdateDriverForPlugAndPlayDevicesW(IntPtr h, string id, string inf, int f, out bool reboot);
}
'@`

/** Pressupõe `$inf` e `$cer` (FileInfo do pacote já extraído). */
export const DRIVER_INSTALL_SCRIPT = [
  DEVICE_API,
  '$thumb = (Get-PfxCertificate -FilePath $cer.FullName).Thumbprint',
  `$rootPath = "Cert:\\LocalMachine\\Root\\$thumb"`,
  '$rootWasThere = Test-Path $rootPath',
  'try {',
  `  Import-Certificate -FilePath $cer.FullName -CertStoreLocation 'Cert:\\LocalMachine\\TrustedPublisher' | Out-Null`,
  `  if (-not $rootWasThere) { Import-Certificate -FilePath $cer.FullName -CertStoreLocation 'Cert:\\LocalMachine\\Root' | Out-Null }`,
  '  pnputil.exe /add-driver $inf.FullName /install | Out-Null',
  '  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { throw "pnputil terminou com o código $LASTEXITCODE" }',
  `  if (-not (Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.HardwareID -contains 'Root\\MttVDD' })) {`,
  `    $guid = [Guid]'4d36e968-e325-11ce-bfc1-08002be10318'`,
  '    $set = [HzDev]::SetupDiCreateDeviceInfoList([ref]$guid, [IntPtr]::Zero)',
  '    $info = New-Object HzDev+Info',
  '    $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)',
  `    if (-not [HzDev]::SetupDiCreateDeviceInfoW($set, 'Display', [ref]$guid, $null, [IntPtr]::Zero, 1, [ref]$info)) { throw 'Não consegui criar o monitor virtual.' }`,
  '    $hw = [Text.Encoding]::Unicode.GetBytes("Root\\MttVDD`0`0")',
  '    [HzDev]::SetupDiSetDeviceRegistryPropertyW($set, [ref]$info, 1, $hw, $hw.Length) | Out-Null',
  `    if (-not [HzDev]::SetupDiCallClassInstaller(0x19, $set, [ref]$info)) { throw 'Não consegui registrar o monitor virtual.' }`,
  '    [HzDev]::SetupDiDestroyDeviceInfoList($set) | Out-Null',
  '    $reboot = $false',
  `    if (-not [HzDev]::UpdateDriverForPlugAndPlayDevicesW([IntPtr]::Zero, 'Root\\MttVDD', $inf.FullName, 1, [ref]$reboot)) { throw 'O Windows recusou o driver do monitor virtual.' }`,
  '  }',
  '} finally {',
  '  if (-not $rootWasThere) { Remove-Item -Path $rootPath -ErrorAction SilentlyContinue }',
  '}'
].join('\n')
