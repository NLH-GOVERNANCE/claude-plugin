# A Windows notification (toast) from the hidden Loa: the window is hidden, so a sentence printed there is never seen.
# Clicking it opens Claude (the desktop app when its claude:// address is registered, else the web). Written 28/10 (26f86f3d).
# Usage: powershell -File toast.ps1 -Text "<sentence>"   Exit 0 when shown, 1 when Windows refused (nothing else to do).
param(
  [Parameter(Mandatory = $true)][string]$Text,
  [string]$Title = 'Loa',
  [string]$Url = ''
)
$ErrorActionPreference = 'Stop'
try {
  if (-not $Url) {
    $Url = if (Test-Path -LiteralPath 'Registry::HKEY_CLASSES_ROOT\claude\shell\open\command') { 'claude://' } else { 'https://claude.ai/code' }
  }
  # Its own name in the notification (no admin: the current user's registry). Without it Windows says "Windows PowerShell".
  $app = 'NLH.Loa'
  $key = "HKCU:\Software\Classes\AppUserModelId\$app"
  if (-not (Test-Path -LiteralPath $key)) { New-Item -Path $key -Force | Out-Null }
  if ((Get-ItemProperty -LiteralPath $key -Name DisplayName -ErrorAction SilentlyContinue).DisplayName -ne $Title) {
    New-ItemProperty -LiteralPath $key -Name DisplayName -Value $Title -PropertyType String -Force | Out-Null
  }
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $esc = { param($s) [Security.SecurityElement]::Escape($s) }
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast activationType=""protocol"" launch=""$(& $esc $Url)""><visual><binding template=""ToastGeneric""><text>$(& $esc $Title)</text><text>$(& $esc $Text)</text></binding></visual></toast>")
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
  exit 0
} catch {
  exit 1
}
