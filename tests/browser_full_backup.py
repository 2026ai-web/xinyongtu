"""Real IndexedDB backup/restore across independent contexts; no merchant access."""
from pathlib import Path
import json,tempfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def route(r):
  name=r.request.url.split('?')[0].replace(origin+'/extension/','');r.fulfill(body=(root/name).read_text() if (root/name).is_file() else '<html><body></body></html>',content_type='text/html; charset=utf-8' if name.endswith('.html') else 'text/css' if name.endswith('.css') else 'application/javascript')
 def page():
  ctx=browser.new_context(accept_downloads=True);ctx.route(origin+'/extension/**',route);tab=ctx.new_page();tab.goto(origin+'/extension/fixture.html');return ctx,tab
 c1,a=page();backup=a.evaluate('''async()=>{
 const {createBatchStore}=await import('./batch-store.js'),{costStorage}=await import('./cost-panel.js'),{createFullBackup}=await import('./backup-runtime.js');const s=createBatchStore(),shop='backup-fixture',date='2026-10-31';
 const data={shop,origin:location.origin,type:'account-day',mode:'全部',date,summary:[{label:'总花费(元)',current:'24',state:'exact'}],context:{primaryVerified:true,dates:[date]}};const key=await s.saveDataset(data);await s.saveJob({id:'job',shop,dates:[date],phase:'complete',completedDays:{[date]:key},units:{},datasets:[key]});await costStorage('versions','put',{id:'v1',effectiveFrom:'2026-10-01',importedAt:'2026-11-03',costs:{map:{SKU:{values:[1000]}},duplicates:0}});await costStorage('reports','put',{id:'report',schemaVersion:'order-cost-accounting-1',shopNote:shop,date,details:[],summary:{balanceFen:12345}});await (await import('./history.js')).createHistoryStore().append({id:'legacy',at:new Date().toISOString(),scope:{shop,origin:location.origin,mode:'全部',dates:[date],filter:''},scopeKey:'fixture',accepted:false,problems:['fixture']});localStorage.setItem('batch-preferences',JSON.stringify({shop,mode:'single',startDate:date,endDate:date}));return createFullBackup('test');
 }''')
 c2,b=page();result=b.evaluate('''async file=>{
 const {previewFullRestore,restoreFullBackup,createFullBackup}=await import('./backup-runtime.js'),{costStorage}=await import('./cost-panel.js'),{createBatchStore}=await import('./batch-store.js');const p=await previewFullRestore(file);if(!p.canRestore||p.counts['warehouse/datasets'].add!==1)throw Error('bad preview');await restoreFullBackup(file);const after=await createFullBackup('test');if(JSON.stringify(after.payload)!==JSON.stringify(file.payload))throw Error('round-trip data differs');const repeat=await previewFullRestore(file);if(repeat.counts['warehouse/datasets'].same!==1)throw Error('duplicate not skipped');await restoreFullBackup(file);
 const corrupt=structuredClone(file);corrupt.payload.costs.versions[0][1].costs.map.SKU.values=[9999];let rejected=false;try{await restoreFullBackup(corrupt);}catch{rejected=true;}if(!rejected)throw Error('corrupt file accepted');
 const changed=await costStorage('versions','getAll');changed[0].costs.map.SKU.values=[2000];await costStorage('versions','put',changed[0]);const conflict=await previewFullRestore(file);if(conflict.canRestore||!conflict.conflicts.length)throw Error('conflict not detected');let stopped=false;try{await restoreFullBackup(file);}catch{stopped=true;}if(!stopped||(await costStorage('versions','getAll'))[0].costs.map.SKU.values[0]!==2000)throw Error('local data overwritten');
 await createBatchStore().claim('active-owner');let locked=false;try{await createFullBackup('test');}catch{locked=true;}await createBatchStore().release('active-owner');if(!locked)throw Error('active collection not protected');return {roundTrip:true,repeated:true,corruptRejected:rejected,conflictStopped:stopped,activeLeaseBlocked:locked};
 }''',backup)
 # Simulate a cross-DB interruption after warehouse transaction committed.
 c3,c=page();crash=c.evaluate('''async file=>{
 const {restoreFullBackup}=await import('./backup-runtime.js'),{createBatchStore}=await import('./batch-store.js'),{journal}=await import('./local-data-lock.js');const original=IDBObjectStore.prototype.put;let injected=false;IDBObjectStore.prototype.put=function(...args){if(this.name==='versions'&&!injected){injected=true;throw Error('fixture interrupted cost write');}return original.apply(this,args);};let failed=false;try{await restoreFullBackup(file);}catch{failed=true;}finally{IDBObjectStore.prototype.put=original;}if(!failed||!await journal('get'))throw Error('no durable recovery intent');let blocked=false;try{await createBatchStore().latest('backup-fixture');}catch{blocked=true;}if(!blocked)throw Error('half-restored data readable');return {failed,blocked};
 }''',backup)
 c.add_init_script("window.chrome={runtime:{getManifest:()=>({version:'test'})},tabs:{onActivated:{addListener:()=>{}},onUpdated:{addListener:()=>{}}}}");c.goto(origin+'/extension/panel.html');c.wait_for_function("document.querySelector('#fullBackupStatus').textContent.includes('上次中断的恢复已继续完成')");resumed=c.evaluate('''async file=>{const {resumeFullRestore,createFullBackup}=await import('./backup-runtime.js'),{journal}=await import('./local-data-lock.js');if(await journal('get'))throw Error('journal did not finish');const after=await createFullBackup('test');if(JSON.stringify(after.payload)!==JSON.stringify(file.payload))throw Error('resume differs');return true;}''',backup)
 # UI preview is read-only; explicit confirmation restores into a fourth context.
 c4=browser.new_context(accept_downloads=True);c4.route(origin+'/extension/**',route);c4.add_init_script("window.chrome={runtime:{getManifest:()=>({version:'test'})},tabs:{onActivated:{addListener:()=>{}},onUpdated:{addListener:()=>{}}}}");ui=c4.new_page();ui.goto(origin+'/extension/panel.html');ui.locator('#fullBackupTools details').evaluate('(e)=>e.open=true')
 with tempfile.TemporaryDirectory(prefix='full-backup-ui-') as tmp:
  path=Path(tmp)/'full.json';path.write_text(json.dumps(backup));ui.locator('#fullBackupFile').set_input_files(path);ui.locator('#fullBackupPreview').click();ui.wait_for_function("!document.querySelector('#fullBackupConfirm').disabled")
  assert ui.evaluate("async()=> (await (await import('./cost-panel.js')).costStorage('versions','getAll')).length")==0
  ui.locator('#fullBackupConfirm').click();ui.wait_for_function("document.querySelector('#fullBackupStatus').textContent.includes('恢复完成')")
  assert ui.evaluate("async()=> (await (await import('./cost-panel.js')).costStorage('versions','getAll'))[0].costs.map.SKU.values[0]")==1000

  with ui.expect_navigation(wait_until='load'):ui.locator('#fullBackupReload').click()
  ui.wait_for_function("document.querySelector('#shopLabel').value==='backup-fixture'");assert ui.locator('#shopLabel').input_value()=='backup-fixture'
  ui.locator('#fullBackupTools details').evaluate('(e)=>e.open=true')
  with ui.expect_download() as event:ui.locator('#fullBackupSave').click()
  downloaded=Path(tmp)/'download.json';event.value.save_as(downloaded);saved=json.loads(downloaded.read_text());assert saved['payload']==backup['payload']
 print('PASS full backup:',result,'interruption',crash,'reload-resumed',resumed,flush=True);browser.close()
