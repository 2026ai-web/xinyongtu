from pathlib import Path
import tempfile,shutil,subprocess,json
root=Path(__file__).resolve().parents[1]
import os
pwsh=os.environ.get('POWERSHELL_BIN') or shutil.which('pwsh') or '/tmp/xinyongtu-pwsh/pwsh'
def run(script,*args,success=True):
 r=subprocess.run([pwsh,'-NoProfile','-File',str(script),*map(str,args)],capture_output=True,text=True)
 assert (r.returncode==0)==success,(r.stdout,r.stderr)
 return r
with tempfile.TemporaryDirectory(prefix='xinyongtu installer ') as temp:
 temp=Path(temp);package=temp/'package with spaces';package.mkdir();script=package/'install.ps1';shutil.copy(root/'windows-installer/install.ps1',script);source=package/'xinyongtu-edge-sidebar';shutil.copytree(root/'edge-extension',source);dest=temp/'installed';args=['-NoUI','-Destination',dest]
 run(script,*args)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']=='0.12.0'
 (dest/'user-data-sentinel').write_text('keep')
 manifest=json.loads((source/'manifest.json').read_text());manifest['version']='0.12.1';(source/'manifest.json').write_text(json.dumps(manifest))
 run(script,*args)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']=='0.12.1'
 assert json.loads((dest/'previous/manifest.json').read_text())['version']=='0.12.0'
 assert (dest/'user-data-sentinel').read_text()=='keep'
 (source/'reader.js').unlink();run(script,*args,success=False)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']=='0.12.1'
 # Bad network payload must not touch the installed extension.
 quote=lambda p:"'"+str(p).replace("'","''")+"'"
 harness=temp/'bad-download.ps1';harness.write_text("function Invoke-RestMethod { return @{version='0.12.2';sha256=('0'*64);url='https://github.com/2026ai-web/xinyongtu/raw/"+('a'*40)+"/xinyongtu-edge-sidebar-0.12.2.zip'} }\nfunction Invoke-WebRequest {param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing);[IO.File]::WriteAllText($OutFile,'corrupt')}\n& "+quote(script)+" -Update -NoUI -Destination "+quote(dest))
 run(harness,success=False)
 assert json.loads((dest/'extension/manifest.json').read_text())['version']=='0.12.1'
 assert not list(dest.glob('staging-*'))
 # Exercise successful verified ZIP download/extraction using a local transport stub.
 archive=root/'dist/xinyongtu-edge-sidebar-0.12.0.zip'
 import hashlib
 good=temp/'verified-download.ps1';fresh=temp/'fresh from update'
 good.write_text("function Invoke-RestMethod { return @{version='0.12.0';sha256='"+hashlib.sha256(archive.read_bytes()).hexdigest()+"';url='https://github.com/2026ai-web/xinyongtu/raw/"+('a'*40)+"/xinyongtu-edge-sidebar-0.12.0.zip'} }\nfunction Invoke-WebRequest {param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing);Copy-Item -LiteralPath "+quote(archive)+" -Destination $OutFile}\n& "+quote(script)+" -Update -NoUI -Destination "+quote(fresh))
 run(good)
 assert json.loads((fresh/'extension/manifest.json').read_text())['version']=='0.12.0'
 print('PASS: first install, stable path update, previous backup, user file retention, incomplete package, checksum failure, verified ZIP extraction, cleanup; path contains spaces')
