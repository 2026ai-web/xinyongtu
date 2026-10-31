param([switch]$Update,[switch]$NoUI,[string]$Destination)
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$files=@('manifest.json','background.js','panel.html','panel.css','panel.js','reader.js','auto-collector.js','snapshot-quality.js','history.js','freshness.js','refresh-cycle.js','report-entry.js','report-navigation.js','batch-dom.js','batch-model.js','batch-store.js','batch-driver.js','batch-runner.js','batch-panel.js','使用说明.txt')
if(!$Destination){$Destination=Join-Path $env:LOCALAPPDATA 'Xinyongtu'}
$root=[IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $root | Out-Null
$lock=$null;$temp=$null
try {
 $lock=[IO.File]::Open((Join-Path $root 'update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
 $target=Join-Path $root 'extension';$backup=Join-Path $root 'previous'
 $temp=Join-Path $root ('staging-'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $temp | Out-Null
 $source=Join-Path $PSScriptRoot 'xinyongtu-edge-sidebar'
 if($Update){
  $meta=Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/2026ai-web/xinyongtu/release-channel/latest.json' -TimeoutSec 30
  if($meta.version -notmatch '^\d+\.\d+\.\d+$' -or $meta.sha256 -notmatch '^[a-f0-9]{64}$' -or $meta.url -notmatch '^https://github\.com/2026ai-web/xinyongtu/raw/[a-f0-9]{40}/xinyongtu-edge-sidebar-\d+\.\d+\.\d+\.zip$'){throw 'Invalid update metadata'}
  $archive=Join-Path $temp 'package.zip'
  Invoke-WebRequest -UseBasicParsing -Uri $meta.url -OutFile $archive -TimeoutSec 120
  if((Get-FileHash $archive -Algorithm SHA256).Hash.ToLower() -ne $meta.sha256){throw 'Download checksum mismatch; installed version was not changed'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip=[IO.Compression.ZipFile]::OpenRead($archive)
  try{foreach($entry in $zip.Entries){$name=$entry.FullName.Replace('\','/');if($name.Contains('../') -or $name.StartsWith('/') -or $name.Contains(':')){throw 'Unsafe archive path'}}}finally{$zip.Dispose()}
  $expanded=Join-Path $temp 'download';Expand-Archive -LiteralPath $archive -DestinationPath $expanded
  $source=Join-Path $expanded 'xinyongtu-edge-sidebar'
 }
 $stage=Join-Path $temp 'extension';New-Item -ItemType Directory -Path $stage | Out-Null
 foreach($name in $files){$inputFile=Join-Path $source $name;if(!(Test-Path -LiteralPath $inputFile -PathType Leaf)){throw "Missing package file: $name"};Copy-Item -LiteralPath $inputFile -Destination (Join-Path $stage $name)}
 $manifest=Get-Content -LiteralPath (Join-Path $stage 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 if($manifest.manifest_version -ne 3 -or $manifest.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid extension manifest'}
 if($Update -and $manifest.version -ne $meta.version){throw 'Version mismatch'}
 if(Test-Path $target){
  $current=Get-Content -LiteralPath (Join-Path $target 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if([version]$manifest.version -lt [version]$current.version){throw 'Refusing to install an older version'}
 }
 if(Test-Path $backup){Remove-Item -LiteralPath $backup -Recurse -Force}
 $hadPrevious=Test-Path $target
 if($hadPrevious){Move-Item -LiteralPath $target -Destination $backup}
 try{Move-Item -LiteralPath $stage -Destination $target}catch{if($hadPrevious){Move-Item -LiteralPath $backup -Destination $target};throw}
 # Store the updater outside the extension. Its path remains stable across upgrades.
 if([IO.Path]::GetFullPath($PSCommandPath) -ne (Join-Path $root 'install.ps1')){Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $root 'install.ps1') -Force}
 if(!$NoUI){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) '新龙图更新.lnk'))
  $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $root 'install.ps1')+'" -Update'
  $shortcut.WorkingDirectory=$root;$shortcut.Save()
  Set-Clipboard -Value $target
  Add-Type -AssemblyName System.Windows.Forms
  if($hadPrevious){$message="更新完成。请在 Edge 扩展页找到新龙图，点一次重新加载，再刷新商家报表页。`n不要删除插件。以后更新只需双击桌面的「新龙图更新」。"}
  else{$message="文件已安装，路径已复制。`n首次使用：打开 edge://extensions，开启开发者模式，点「加载解压缩的扩展」，在文件夹地址栏粘贴路径并选择此文件夹。`n以后更新只需双击桌面的「新龙图更新」，无需下载解压。`n旧插件请先停用保留，旧记录不会自动迁移。"}
  [Windows.Forms.MessageBox]::Show($message,'新龙图 '+$manifest.version) | Out-Null
  Start-Process explorer.exe -ArgumentList $target
 }
 Write-Output ('Installed '+$manifest.version+' at '+$target)
} catch {
 if(!$NoUI){Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.MessageBox]::Show(('安装或更新未完成：'+$_.Exception.Message+"`n请保留当前插件，将此提示发给开发者。"),'新龙图') | Out-Null}
 throw
} finally {
 if($temp -and (Test-Path $temp)){Remove-Item -LiteralPath $temp -Recurse -Force}
 if($lock){$lock.Dispose()}
}
