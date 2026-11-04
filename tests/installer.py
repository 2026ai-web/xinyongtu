from pathlib import Path
import tempfile,shutil,subprocess,json
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'edge-extension/manifest.json').read_text())['version']
next_version='.'.join(version.split('.')[:2]+[str(int(version.split('.')[-1])+1)])
import os
pwsh=os.environ.get('POWERSHELL_BIN') or shutil.which('pwsh') or '/tmp/xinyongtu-pwsh/pwsh'
def run(script,*args,success=True):
 r=subprocess.run([pwsh,'-NoProfile','-File',str(script),*map(str,args)],capture_output=True,text=True)
 assert (r.returncode==0)==success,(r.stdout,r.stderr)
 return r
with tempfile.TemporaryDirectory(prefix='xinyongtu installer ') as temp:
 temp=Path(temp);package=temp/'package with spaces';package.mkdir();script=package/'install.ps1';shutil.copy(root/'windows-installer/install.ps1',script);source=package/'xinyongtu-edge-sidebar';shutil.copytree(root/'edge-extension',source);dest=temp/'installed';args=['-NoUI','-Destination',dest]
 run(script,*args)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']==version
 (dest/'user-data-sentinel').write_text('keep')
 manifest=json.loads((source/'manifest.json').read_text());manifest['version']=next_version;(source/'manifest.json').write_text(json.dumps(manifest))
 run(script,*args)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']==next_version
 assert json.loads((dest/'previous/manifest.json').read_text())['version']==version
 assert (dest/'user-data-sentinel').read_text()=='keep'
 (source/'reader.js').unlink();run(script,*args,success=False)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']==next_version
 # Bad network payload must not touch the installed extension.
 quote=lambda p:"'"+str(p).replace("'","''")+"'"
 harness=temp/'bad-download.ps1';harness.write_text("function Invoke-RestMethod { return @{version='0.12.2';sha256=('0'*64);url='https://github.com/2026ai-web/xinyongtu/raw/"+('a'*40)+"/xinyongtu-edge-sidebar-0.12.2.zip'} }\nfunction Invoke-WebRequest {param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing);[IO.File]::WriteAllText($OutFile,'corrupt')}\n& "+quote(script)+" -Update -NoUI -Destination "+quote(dest))
 run(harness,success=False)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']==next_version
 assert not list(dest.glob('staging-*'))
 # Exercise successful verified ZIP download/extraction using a local transport stub.
 archive=root/'dist'/('xinyongtu-edge-sidebar-'+version+'.zip')
 import hashlib
 good=temp/'verified-download.ps1';fresh=temp/'fresh from update'
 good.write_text("function Invoke-RestMethod { return @{version='"+version+"';sha256='"+hashlib.sha256(archive.read_bytes()).hexdigest()+"';url='https://github.com/2026ai-web/xinyongtu/raw/"+('a'*40)+"/xinyongtu-edge-sidebar-0.12.0.zip'} }\nfunction Invoke-WebRequest {param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing);Copy-Item -LiteralPath "+quote(archive)+" -Destination $OutFile}\n& "+quote(script)+" -Update -NoUI -Destination "+quote(fresh))
 run(good)
 assert json.loads((fresh/'extension/manifest.json').read_text())['version']==version
 shutil.rmtree(source);shutil.copytree(root/'edge-extension',source)
 # Optional Windows UI failures must not turn an installed extension into a failure.
 for clipboard_ok in [False,True]:
  ui=temp/('ui-ok.ps1' if clipboard_ok else 'ui-busy.ps1');ui_dest=temp/('UI copied' if clipboard_ok else 'UI busy');copied=temp/'clipboard-value.txt'
  clip="[IO.File]::WriteAllText("+quote(copied)+",$Value)" if clipboard_ok else "throw [System.Runtime.InteropServices.ExternalException]::new('fixture clipboard busy')"
  ui.write_text("function Set-Clipboard {param($Value);"+clip+"}\nfunction Add-Type {param($AssemblyName);throw 'fixture message window unavailable'}\nfunction Start-Process {param($FilePath,$ArgumentList);throw 'fixture explorer unavailable'}\n& "+quote(script)+" -Destination "+quote(ui_dest),encoding='utf-8-sig')
  result=run(ui)
  assert json.loads((ui_dest/'extension/manifest.json').read_text())['version']==version
  assert 'Installed '+version in result.stdout and str(ui_dest/'extension') in result.stdout
  if clipboard_ok:assert copied.read_text()==str(ui_dest/'extension') and '路径已复制到剪贴板' in result.stdout
  else:assert '剪贴板暂不可用' in result.stdout and '路径未复制' in result.stdout and '路径已复制到剪贴板' not in result.stdout
  assert not list(ui_dest.glob('staging-*'))
  (ui_dest/'user-data-sentinel').write_text('keep')
  run(ui);assert (ui_dest/'user-data-sentinel').read_text()=='keep'
 (source/'background.js').unlink();failed=run(ui,success=False);assert 'Missing package file: background.js' in failed.stderr;assert json.loads((ui_dest/'extension/manifest.json').read_text())['version']==version;assert (ui_dest/'user-data-sentinel').read_text()=='keep'
 print('PASS optional UI: clipboard ExternalException and shortcut/message/explorer failures leave successful install/update, truthful manual path, data sentinel and cleanup; clipboard success also verified')
 print('PASS: first install, stable path update, previous backup, user file retention, incomplete package, checksum failure, verified ZIP extraction, cleanup; path contains spaces')
