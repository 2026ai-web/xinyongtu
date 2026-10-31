from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量']
def html(unit=False):
    controls='<nav>今日 昨日 近7日 近30日 近90日 <input type="date" value="2026-10-30"></nav><div><button>趋势图</button><button>表格</button></div>'
    if not unit: controls+='<nav><button aria-selected="true">全部</button><button>稳定成本推广</button><button>全店托管</button></nav>'
    else: controls+='<p>商品 ID：900224894507</p>'
    headers='<th>时段</th>'+''.join('<th>'+f+'</th>' for f in fields)
    hours=''.join('<tr><td>'+str(i)+':00-'+str(i)+':59</td>'+''.join('<td>1</td>' for f in fields)+'</tr>' for i in range(24))
    products='' if unit else '<p>合计数据（1条）</p><table><thead><tr><th>商品</th>'+''.join('<th>'+f+'</th>' for f in fields)+'</tr></thead><tbody><tr><td>商品 ID：900224894507 稳定成本推广 <a href="/goods/report/promotion/unit?adId=9146588221&beginDate=2026-10-30&endDate=2026-10-30">查看详情</a></td>'+''.join('<td>24</td>' for f in fields)+'</tr></tbody></table>'
    return '<style>td,th{min-width:90px;padding:4px}nav{padding:8px}input{width:150px}</style>'+controls+'<table><thead><tr>'+headers+'</tr></thead><tbody>'+hours+'</tbody></table>'+products+'<button onclick="window.bad=true">调整预算</button>'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1500,'height':900})
    def route(r):
        path=r.request.url.split('?')[0].replace(origin,'')
        if path.startswith('/extension/'):
            name=path.removeprefix('/extension/')
            r.fulfill(body=(root/name).read_text(),content_type='text/html; charset=utf-8' if name.endswith('.html') else 'text/css' if name.endswith('.css') else 'application/javascript')
        else:r.fulfill(body=html(path.endswith('/unit')),content_type='text/html; charset=utf-8')
    page.route(origin+'/**',route)
    page.goto(origin+'/goods/report/promotion/overView')
    page.evaluate("async()=>{window.dom=(await import('/extension/batch-dom.js')).batchReportDocument;window.model=await import('/extension/batch-model.js');}")
    data=page.evaluate("dom({action:'read'})")
    assert data['context']['primaryVerified'] and data['context']['selectedMode']=='全部',data
    assert len(data['hourly'])==24 and len(data['products'])==1,data
    assert data['products'][0]['adId']=='9146588221',data
    assert page.evaluate("model.validateHours(dom({action:'read'}).hourly,'全部').complete")
    assert page.evaluate("dom({action:'date-step',start:'2026-10-29'}).kind")=='native-date-requested'
    assert page.evaluate("dom({action:'read'}).context.dates")==['2026-10-29']
    assert not page.evaluate('Boolean(window.bad)')
    # IndexedDB real browser persistence and exclusive lease.
    result=page.evaluate('''async()=>{const {createBatchStore}=await import('/extension/batch-store.js');const s=createBatchStore();await s.clear();await s.claim('first');let refused=false;try{await s.claim('second')}catch{refused=true}await s.release('first');await s.claim('second');await s.release('second');await s.saveJob({id:'test',shop:'fixture'});await s.saveDataset({shop:'fixture',origin:'test',type:'account-day',date:'2026-10-30',payload:'exact'});return {refused,job:await s.latest('fixture'),data:await s.export('fixture')};}''')
    assert result['refused'] and result['job']['id']=='test' and len(result['data']['datasets'])==1,result
    page.reload()
    assert page.evaluate("async()=>{const {createBatchStore}=await import('/extension/batch-store.js');return (await createBatchStore().latest('fixture')).id}")=='test'
    page.goto(origin+'/goods/report/promotion/unit?adId=9146588221&beginDate=2026-10-30&endDate=2026-10-30')
    unit=page.evaluate("async()=>{const {batchReportDocument}=await import('/extension/batch-dom.js');return batchReportDocument({action:'read'})}")
    assert unit['context']['productId']=='900224894507' and unit['context']['adId']=='9146588221',unit
    # Exercise the actual serialized DOM driver and runner, with a browser-tabs adapter.
    page.goto(origin+'/goods/report/promotion/overView')
    page.evaluate("window.fixtureOverview="+json.dumps(html())+";window.fixtureUnit="+json.dumps(html(True)))
    integration=page.evaluate('''async()=>{
      const {createBatchDriver}=await import('/extension/batch-driver.js');
      const {runBatch}=await import('/extension/batch-runner.js');
      const {createBatchStore}=await import('/extension/batch-store.js');
      const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}],update:async(id,change)=>{if(change.url){const u=new URL(change.url);history.replaceState(null,'',u.href);document.body.innerHTML=u.pathname.endsWith('/unit')?window.fixtureUnit:window.fixtureOverview;const date=u.searchParams.get('beginDate');if(date)document.querySelector('input').value=date;}},remove:async()=>{}},scripting:{executeScript:async({func,args})=>[{result:func(...args)}]}};
      const store=createBatchStore();await store.clear();
      const driver=createBatchDriver({tabId:1,api,signal:new AbortController().signal});
      const job=await runBatch({shop:'integration',days:1,store,driver,overviewURL:location.href,now:Date.parse('2026-10-31T01:00:00Z')});
      return {job,data:await store.export('integration')};
    }''')
    assert integration['job']['phase']=='complete',integration
    assert len(integration['data']['datasets'])==3,integration
    page.add_init_script("window.chrome={tabs:{onActivated:{addListener:()=>{}},onUpdated:{addListener:()=>{}}}}")
    errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.goto(origin+'/extension/panel.html')
    page.wait_for_timeout(300)
    assert not errors,errors
    assert page.locator('#batchStart').is_visible()
    assert page.locator('#shopLabel').count()==1
    page.locator('#batchStart').click()
    page.wait_for_timeout(100)
    assert '填写店铺备注' in page.locator('#batchStatus').inner_text()
    assert page.locator('#batchStart').is_enabled()
    browser.close()
print('PASS: real DOM account/unit/date/24 hours, no budget click, IndexedDB lease and reload persistence')
