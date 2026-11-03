"""Actual panel downloads compact persisted task after reload; raw backup remains."""
from pathlib import Path
import json,tempfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with sync_playwright() as p, tempfile.TemporaryDirectory(prefix='xinyongtu-gpt-export-') as tmp:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(accept_downloads=True)
 page.add_init_script("window.chrome={runtime:{getManifest:()=>({version:'test'})},tabs:{onActivated:{addListener:()=>{}},onUpdated:{addListener:()=>{}}}}")
 def route(r):
  path=r.request.url.split('?')[0].replace(origin,'').removeprefix('/extension/')
  r.fulfill(body=(root/path).read_text(),content_type='text/html; charset=utf-8' if path.endswith('.html') else 'text/css' if path.endswith('.css') else 'application/javascript')
 page.route(origin+'/extension/**',route);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin+'/extension/panel.html')
 page.evaluate('''async()=>{
 const {createBatchStore}=await import('./batch-store.js'),{metricFields,datasetKey}=await import('./batch-model.js');const store=createBatchStore();await store.clear();const date='2026-10-30',shop='offline-gpt',metrics=n=>metricFields.map(label=>({label,current:String(n),state:'exact'})),hourly=Array.from({length:24},(_,hour)=>({hour,metrics:metrics(1)})),row={productId:'900224894507',adId:'9146588221',mode:'稳定成本推广',metrics:metrics(24)},base={shop,origin:location.origin,date,capturedAt:'2026-11-03T01:00:00Z',hourly};
 const account={...base,type:'account-day',mode:'全部',summary:metrics(24),summarySources:metricFields.map(label=>({label,source:'overview-table-total'})),products:[row],context:{primaryVerified:true,dates:[date]}},unit={...base,...row,type:'unit-day',summary:metrics(24),dailyOverall:row,context:{primaryVerified:true,dates:[date],beginDate:date,endDate:date,productId:row.productId,adId:row.adId}};
 await store.saveDataset(account);await store.saveDataset(unit);await store.saveJob({id:'persisted-job',shop,dates:[date],phase:'complete',completedDays:{[date]:datasetKey(account)},units:{unit:{completed:{[date]:datasetKey(unit)}}},failures:[]});
 }''')
 page.locator('#shopLabel').fill('offline-gpt');page.locator('#shopLabel').dispatch_event('change');page.reload()
 # Changing UI dates must not silently relabel the persisted task.
 page.locator('#batchDays').select_option('single');page.locator('#batchStartDate').fill('2026-10-29');page.locator('#batchStartDate').dispatch_event('change')
 def download(button,name):
  with page.expect_download() as event:page.locator(button).click()
  item=event.value;target=Path(tmp)/name;item.save_as(target);return json.loads(target.read_text()),item.suggested_filename
 compact,name=download('#batchGptExport','compact.json');assert compact['task']['complete'] and compact['task']['dates']==['2026-10-30'];assert len(compact['records'])==2;assert '2026-10-30' in name;assert '未发送给GPT' in page.locator('#batchStatus').inner_text()
 raw,_=download('#batchExport','raw.json');assert len(raw['datasets'])==2 and len(raw['jobs'])==1;assert 'recordingGuide' in raw and 'diagnosticHistory' in raw
 page.evaluate("async()=>{const s=(await import('./batch-store.js')).createBatchStore(),j=await s.latest('offline-gpt');j.phase='blocked';await s.saveJob(j)}")
 partial,_=download('#batchGptExport','partial.json');assert partial['task']['complete'] is False;assert '未完成' in page.locator('#batchStatus').inner_text()
 page.locator('#shopLabel').fill('no-task');page.locator('#batchGptExport').click();assert '尚无可导出' in page.locator('#batchStatus').inner_text();assert not errors,errors
 print('PASS panel GPT export: persisted task after reload, selected UI date not relabeled, compact JSON download, original backup preserved, partial task marked, no-task error; no model/network submission',flush=True);browser.close()
