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

/**
 * Certificados pelo .NET, sem a unidade `Cert:`: ela some quando o PowerShell herda o `PSModulePath` do PowerShell 7
 * (visto na CI do GitHub em 17/11/2026), e aí o driver nunca era confiado e a instalação passava calada.
 */
const CERT_API = [
  '$ErrorActionPreference = "Stop"',
  "$env:PSModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')",
  "function Hz-Store($name) { $s = New-Object System.Security.Cryptography.X509Certificates.X509Store($name, 'LocalMachine'); $s.Open('ReadWrite'); $s }",
  'function Hz-Cert($path) { New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($path) }',
  'function Hz-Has($name, $cert) { $s = Hz-Store $name; try { @($s.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }).Count -gt 0 } finally { $s.Close() } }',
  'function Hz-Add($name, $cert) { $s = Hz-Store $name; try { $s.Add($cert) } finally { $s.Close() } }',
  'function Hz-Remove($name, $cert) { $s = Hz-Store $name; try { $s.Remove($cert) } finally { $s.Close() } }'
].join('\n')

/** Pressupõe `$inf` e `$cer` (FileInfo do pacote já extraído). */
export const DRIVER_INSTALL_SCRIPT = [
  DEVICE_API,
  CERT_API,
  '$cert = Hz-Cert $cer.FullName',
  '$rootWasThere = Hz-Has Root $cert',
  'try {',
  '  Hz-Add TrustedPublisher $cert',
  '  if (-not $rootWasThere) { Hz-Add Root $cert }',
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
  '  }',
  // Um dispositivo órfão pode existir depois da desinstalação do pacote. Vincular também nesse caso.
  '  $reboot = $false',
  `  if (-not [HzDev]::UpdateDriverForPlugAndPlayDevicesW([IntPtr]::Zero, 'Root\\MttVDD', $inf.FullName, 1, [ref]$reboot)) { throw 'O Windows recusou o driver do monitor virtual.' }`,
  '} finally {',
  '  if (-not $rootWasThere) { Hz-Remove Root $cert }',
  '}'
].join('\n')
