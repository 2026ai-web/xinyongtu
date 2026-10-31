from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).resolve().parents[1]
files=['manifest.json','background.js','panel.html','panel.css','panel.js','reader.js','auto-collector.js','snapshot-quality.js','history.js','freshness.js','refresh-cycle.js','report-entry.js','report-navigation.js','batch-dom.js','batch-model.js','batch-store.js','batch-driver.js','batch-runner.js','batch-panel.js','使用说明.txt']
version=json.loads((root/'edge-extension/manifest.json').read_text())['version']
out=root/'dist';out.mkdir(exist_ok=True);target=out/f'xinyongtu-edge-sidebar-{version}.zip'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
    for name in sorted(files):
        data=(root/'edge-extension'/name).read_bytes();info=zipfile.ZipInfo('xinyongtu-edge-sidebar/'+name,date_time=(2026,10,31,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
with zipfile.ZipFile(target,'a',zipfile.ZIP_DEFLATED) as z:
    for name in ['install.cmd','install.ps1','先看这里.txt']:
        data=(root/'windows-installer'/name).read_bytes();info=zipfile.ZipInfo(name,date_time=(2026,10,31,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
digest=hashlib.sha256(target.read_bytes()).hexdigest();target.with_suffix('.zip.sha256').write_text(digest+'  '+target.name+'\n');print(target);print(digest)
