"""Offline panel XLSX import, local persistence, orders, ad join and downloaded accounting."""
from pathlib import Path
import json,tempfile,sys,csv
from decimal import Decimal,ROUND_HALF_UP
import openpyxl
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
with tempfile.TemporaryDirectory(prefix='cost-accounting-') as tmp, sync_playwright() as p:
 tmp=Path(tmp);real=len(sys.argv)==4
 if real:
  cost,orders,accountFile=map(Path,sys.argv[1:]);data=json.loads(accountFile.read_text());account=next(r for r in data['datasets'] if r['type']=='account-day' and r['date']=='2026-10-31');shop=account['shop'];records=list(csv.DictReader(orders.open(encoding='utf-8-sig',newline='')));included=[r for r in records if r['订单状态'] in ['已发货，待收货','已收货'] and r['售后状态']=='无售后或售后取消'];used={r['商家编码-规格维度'].strip() for r in included};costmap={str(r[1]).strip():Decimal(str(r[8])) for r in list(openpyxl.load_workbook(cost,data_only=True).active.values)[1:] if str(r[1]).strip() in used};receipts=sum(Decimal(r['商家实收金额(元)'].strip()) for r in included);fullcost=sum(costmap[r['商家编码-规格维度'].strip()]*int(r['商品数量(件)'].strip()) for r in included);fee=(receipts*Decimal('.035')).quantize(Decimal('.01'),ROUND_HALF_UP);ad=Decimal(next(m['current'] for m in account['summary'] if m['label']=='总花费(元)').replace(',',''));expected=int((receipts-fullcost-fee-ad)*100)
 else:
  cost=tmp/'cost.xlsx';w=openpyxl.Workbook();ws=w.active;ws.append(['商家编码-规格维度','单个SKU总成本']);ws.append(['SKU-A',10]);ws.append(['SKU-B',20]);w.save(cost)
  orders=tmp/'orders.csv';orders.write_text('订单号,订单状态,商品数量(件),商品id,商家编码-规格维度,售后状态,商家实收金额(元)\n1,已收货,2,900224894507,SKU-A,无售后或售后取消,100\n2,已发货，待收货,1,900224894508,SKU-B,无售后或售后取消,50\n3,已取消,1,900224894508,SKU-MISSING,无售后或售后取消,100\n',encoding='utf-8-sig');shop='offline-cost';expected=8075;fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量'];account={'shop':shop,'origin':origin,'type':'account-day','mode':'全部','date':'2026-10-31','capturedAt':'2026-11-03T01:00:00Z','context':{'primaryVerified':True,'dates':['2026-10-31']},'summary':[{'label':f,'current':'24','state':'exact'} for f in fields],'summarySources':[{'label':f,'source':'overview-table-total'} for f in fields],'hourly':[{'hour':h,'metrics':[{'label':f,'current':'1','state':'exact'} for f in fields]} for h in range(24)]}
 if not real:
  account['expectedRows']=2;account['products']=[{'productId':pid,'mode':'稳定成本推广','adId':str(i+9146588221),'metrics':[{'label':'总花费(元)','current':'12','state':'exact'}]} for i,pid in enumerate(['900224894507','900224894508'])]
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(accept_downloads=True);page.add_init_script("window.chrome={runtime:{getManifest:()=>({version:'test'})},tabs:{onActivated:{addListener:()=>{}},onUpdated:{addListener:()=>{}}}}")
 def route(r):
  name=r.request.url.split('?')[0].replace(origin+'/extension/','');r.fulfill(body=(root/name).read_text(),content_type='text/html; charset=utf-8' if name.endswith('.html') else 'text/css' if name.endswith('.css') else 'application/javascript')
 page.route(origin+'/extension/**',route);page.goto(origin+'/extension/panel.html');page.evaluate("async r=>{await (await import('./batch-store.js')).createBatchStore().saveDataset(r)}",account)
 page.locator('#shopLabel').fill(shop);page.locator('#shopLabel').dispatch_event('change');page.locator('#costTools').evaluate('(e)=>e.open=true');page.locator('#costTools details').evaluate('(e)=>e.open=true');page.locator('#costEffective').fill('2026-10-31');page.locator('#costFile').set_input_files(cost);page.locator('#costImport').click();page.wait_for_function("document.querySelector('#costStatus').textContent.includes('已仅保存在本机')");page.reload();page.locator('#costTools').evaluate('(e)=>e.open=true');page.locator('#costDate').fill('2026-10-31');page.locator('#orderFile').set_input_files(orders);page.locator('#costDateConfirmed').check();page.locator('#costCalculate').click();page.wait_for_function("!document.querySelector('#costExport').disabled")
 with page.expect_download() as event:page.locator('#costExport').click()
 target=tmp/'result.json';event.value.save_as(target);report=json.loads(target.read_text());assert report['complete'],report['issues'];assert report['productAccounting']['complete'],report['productAccounting']['issues'];assert report['productAccounting']['reconciliation']['shopBalanceMatches'];assert page.locator('#costProducts tbody tr').count()==len(report['productAccounting']['products']);assert report['summary']['balanceFen']==expected,report['summary'];assert report['costVersion']['effectiveFrom']=='2026-10-31'
 if real:assert report['summary']['includedOrders']==462 and report['summary']['excludedOrders']==75 and report['summary']['quantity']==470
 # Cost backup contains local versions and can be restored after local cost DB removal.
 page.locator('#costTools details').evaluate('(e)=>e.open=true')
 with page.expect_download() as event:page.locator('#costBackup').click()
 backup=tmp/'cost-backup.json';event.value.save_as(backup)
 page.evaluate("async()=>{const {costStorage}=await import('./cost-panel.js');for(const v of await costStorage('versions','getAll'))await costStorage('versions','delete',v.id)}")
 page.locator('#costRestore').set_input_files(backup);page.wait_for_function("document.querySelector('#costStatus').textContent.includes('已恢复')")
 assert page.evaluate("async()=> (await (await import('./cost-panel.js')).costStorage('versions','getAll')).length")==1
 page.locator('#costDate').fill('2026-11-01');page.locator('#costDate').dispatch_event('change');assert not page.locator('#costDateConfirmed').is_checked();assert page.locator('#costExport').is_disabled()
 # An absent account day cannot silently use a nearby date or zero spend.
 missing=page.evaluate("async shop=>await (await import('./cost-panel.js')).accountSpend(shop,'2026-10-30')",shop);assert missing['amount'] is None
 print('PASS real files' if real else 'PASS synthetic panel',json.dumps(report['summary'],ensure_ascii=False), 'cost persistence, XLSX cached values, full SKU cost × quantity, refunds excluded, aggregate 3.5%, exact-day account spend, local download',flush=True);browser.close()
