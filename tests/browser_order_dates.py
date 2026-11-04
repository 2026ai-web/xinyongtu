"""Seven days from order IDs across multiple CSV files; no date-picker work."""
from pathlib import Path
import csv,json,tempfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension';origin='https://yingxiao.pinduoduo.com';dates=['2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03'];header=['订单号','订单状态','商品数量(件)','商品id','商家编码-规格维度','售后状态','商家实收金额(元)']
with sync_playwright() as p,tempfile.TemporaryDirectory(prefix='order-dates-') as tmp:
 tmp=Path(tmp);rows=[[d[2:].replace('-','')+'-'+str(i+1000),'已收货','1','900224894507','SKU','无售后或售后取消','100'] for i,d in enumerate(dates)]
 def file(name,records):
  path=tmp/name
  with path.open('w',encoding='utf-8-sig',newline='') as f:w=csv.writer(f);w.writerow(header);w.writerows(records)
  return path
 first=file('misleading-name-1999.csv',rows[:3]);second=file('also-no-date.csv',rows[3:]);browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=browser.new_context(accept_downloads=True);ctx.add_init_script("window.chrome={runtime:{getManifest:()=>({version:'test'})},tabs:{onActivated:{addListener:()=>{}},onUpdated:{addListener:()=>{}}}}")
 def route(r):
  name=r.request.url.replace(origin+'/extension/','');r.fulfill(body=(root/name).read_text(),content_type='text/html; charset=utf-8' if name.endswith('.html') else 'text/css' if name.endswith('.css') else 'application/javascript')
 ctx.route(origin+'/extension/**',route);page=ctx.new_page();page.goto(origin+'/extension/panel.html');page.evaluate('''async dates=>{const {createBatchStore}=await import('./batch-store.js'),{costStorage}=await import('./cost-panel.js'),{makeCostMap}=await import('./cost-model.js'),{metricFields}=await import('./batch-model.js');for(const date of dates){const metrics=n=>metricFields.map(label=>({label,current:String(n),state:'exact'}));await createBatchStore().saveDataset({shop:'auto-date',origin:location.origin,type:'account-day',mode:'全部',date,capturedAt:'2026-11-04T01:00:00Z',context:{primaryVerified:true,dates:[date]},summary:metrics(24),summarySources:metricFields.map(label=>({label,source:'overview-table-total'})),hourly:Array.from({length:24},(_,hour)=>({hour,metrics:metrics(1)})),expectedRows:1,products:[{productId:'900224894507',mode:'稳定成本推广',adId:'9146588221',metrics:metrics(24)}]});}for(const [id,effectiveFrom,price] of [['v1','2026-10-01','10'],['v2','2026-11-01','20']])await costStorage('versions','put',{id,effectiveFrom,importedAt:'2026-11-04',costs:makeCostMap([['商家编码-规格维度','单个SKU总成本'],['SKU',price]])});}''',dates)
 page.locator('#shopLabel').fill('auto-date');page.locator('#shopLabel').dispatch_event('change');page.locator('#costTools').evaluate('(e)=>e.open=true');assert page.locator('#costDateMode').input_value()=='auto';assert not page.locator('#costDate').is_visible();page.locator('#orderFile').set_input_files([first,second]);page.wait_for_function("document.querySelector('#costDatePreview').textContent.includes('7天、7笔')");page.locator('#costCalculate').click();page.wait_for_function("document.querySelector('#costStatus').textContent.includes('7/7天完整')")
 assert page.locator('#costDaySelect option').count()==7
 with page.expect_download() as event:page.locator('#costExport').click()
 out=tmp/'seven.json';event.value.save_as(out);data=json.loads(out.read_text());assert data['schemaVersion']=='order-cost-batch-1';assert [r['date'] for r in data['results']]==dates
 for entry in data['results']:
  r=entry['report'];assert r['dateSource']=='order-id-prefix';assert r['summary']['includedOrders']==1;assert r['summary']['balanceFen']==(6250 if r['date']<'2026-11-01' else 5250)
 page.locator('#costDaySelect').select_option('6');assert page.locator('#costProducts tbody tr').count()==1
 # Duplicates/unknown dates must stop before adding any report.
 def report_count():return page.evaluate("async()=> (await (await import('./cost-panel.js')).costStorage('reports','getAll')).length")
 count=report_count();dup=file('duplicate.csv',[rows[0]]);page.locator('#orderFile').set_input_files([first,dup]);page.locator('#costCalculate').click();page.wait_for_function("document.querySelector('#costStatus').textContent.includes('重复')");assert report_count()==count
 bad=file('bad.csv',[["unknown"]+rows[0][1:]]);page.locator('#orderFile').set_input_files([first,bad]);page.locator('#costCalculate').click();page.wait_for_function("document.querySelector('#costStatus').textContent.includes('无法识别')");assert report_count()==count
 # Missing same-day ads remain unknown rather than borrowing a nearby day.
 page.evaluate('''async()=>{const {datasetKey}=await import('./batch-model.js');await new Promise((res,rej)=>{const req=indexedDB.open('xinyongtu-report-warehouse',1);req.onsuccess=()=>{const db=req.result,tx=db.transaction('datasets','readwrite');tx.objectStore('datasets').delete(datasetKey({shop:'auto-date',origin:location.origin,type:'account-day',mode:'全部',date:'2026-11-03'}));tx.oncomplete=()=>{db.close();res()};tx.onerror=()=>rej(tx.error)};});}''')
 last=file('last.csv',[rows[-1]]);page.locator('#orderFile').set_input_files(last);page.locator('#costCalculate').click();page.wait_for_function("document.querySelector('#costStatus').textContent.includes('0/1天完整')")
 with page.expect_download() as event:page.locator('#costExport').click()
 out=tmp/'missing.json';event.value.save_as(out);r=json.loads(out.read_text());assert not r['complete'];assert r['summary']['adSpendFen'] is None and r['summary']['balanceFen'] is None
 print('PASS automatic order dates: 7 days / 2 CSV, cost-version boundary, daily fees, selectable compact day view, full batch export, duplicate and unknown no-write, missing same-day ad unknown; filenames ignored',flush=True);browser.close()
