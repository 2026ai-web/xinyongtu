"""Offline real-DOM regressions for three-layer collection; all requests fulfilled locally."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]/'edge-extension'
origin='https://yingxiao.pinduoduo.com'
fields=['总花费(元)','交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量']
def document(unit=False,managed=False):
    current_fields=fields[1:] if unit and managed else fields
    main='<nav>今日 昨日 近7日 近30日 近90日 <input class="mainDate" type="date" value="2026-11-01"></nav>'
    compare='<nav>对比日期<input class="comparisonDate" type="date" value="2026-10-31"></nav>'
    cards='<section><h2>数据概况</h2>'+''.join('<div><span>'+f+'</span><strong>'+('24' if unit else '48')+'</strong><small>较前日 0%</small></div>' for f in fields)+'</section>'
    # Details start in chart view: the hourly table exists only after an explicit toggle.
    total='<tr><td>合计数据（24条）</td>'+''.join('<td>'+('24' if unit else '48')+'</td>' for f in current_fields)+'</tr>'
    table='<table><thead><tr><th>时段</th>'+''.join('<th>'+f+'</th>' for f in current_fields)+'</tr></thead><tbody>'+total+''.join('<tr><td>'+str(i)+':00-'+str(i)+':59</td>'+''.join('<td>'+('1' if unit else '2')+'</td>' for f in current_fields)+'</tr>' for i in range(24))+'</tbody></table>'
    toggle='<div><button>趋势图</button><button id="tableToggle">表格</button></div><div id="hours"></div>'
    products='' if unit else '<h2>数据明细</h2><p>合计数据（2条）</p><table><thead><tr><th>商品</th>'+''.join('<th>'+f+'</th>' for f in current_fields)+'</tr></thead><tbody>'+''.join('<tr><td>商品 ID：'+str(900224894507+i)+(' 全店托管' if i==1 else ' 稳定成本推广')+' <a href="/goods/report/promotion/unit?adId='+str(9146588221+i)+'&beginDate=2026-10-30&endDate=2026-10-30">查看详情</a></td>'+''.join('<td>'+('—' if i==1 and f=='总花费(元)' else '24')+'</td>' for f in current_fields)+'</tr>' for i in range(2))+'</tbody></table>'
    return '<style>td,th{min-width:90px;padding:4px}nav{padding:8px}input{width:150px}</style>'+'<section>'+main+compare+'</section>'+cards+toggle+products+('<p id="identity">商品 ID：900224894507</p>' if unit else '<nav><button aria-selected="true">全部</button><button>稳定成本推广</button><button>全店托管</button></nav>')+'<button id="budget">调整预算</button>',table
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1500,'height':900})
    def route(r):
        path=r.request.url.split('?')[0].replace(origin,'')
        if path.startswith('/extension/'):
            r.fulfill(body=(root/path.removeprefix('/extension/')).read_text(),content_type='application/javascript')
        else:r.fulfill(body='<html><body>fixture</body></html>',content_type='text/html')
    page.route(origin+'/**',route)
    page.goto(origin+'/goods/report/promotion/overView')
    for name,unit,managed in [('Overview',False,False),('Unit',True,False),('Managed',True,True)]:
        body,table=document(unit,managed)
        page.evaluate('(x)=>{window["body"+x.name]=x.body;window["table"+x.name]=x.table}',{'name':name,'body':body,'table':table})
    result=page.evaluate('''async()=>{
      const {batchReportDocument:dom}=await import('/extension/batch-dom.js');
      const {assertDay,createBatchDriver}=await import('/extension/batch-driver.js');
      const {runBatch}=await import('/extension/batch-runner.js');
      const {createBatchStore}=await import('/extension/batch-store.js');
      window.budgetClicks=0;
      function render(url){const u=new URL(url),unit=u.pathname.endsWith('/unit');history.replaceState(null,'',u.href);const managed=unit&&u.searchParams.get('adId')==='9146588222';document.body.innerHTML=unit?(managed?window.bodyManaged:window.bodyUnit):window.bodyOverview;
        document.querySelector('.mainDate').value=u.searchParams.get('beginDate')||'2026-11-01';
        if(unit)document.querySelector('#identity').textContent='商品 ID：'+(Number(u.searchParams.get('adId'))-9146588221+900224894507);
        document.querySelector('#tableToggle').onclick=()=>document.querySelector('#hours').innerHTML=unit?(managed?window.tableManaged:window.tableUnit):window.tableOverview;
        document.querySelector('#budget').onclick=()=>window.budgetClicks++;
      }
      render(location.href);
      const evidence=dom();assertDay(evidence,'2026-11-01');
      if(evidence.summary.length!==0||evidence.hourly.length)throw Error('summary or chart fixture invalid');
      // Two independent primary dates with conflicting values must still reject.
      const conflict=document.createElement('input');conflict.type='date';conflict.setAttribute('aria-label','统计日期');conflict.value='2026-10-31';document.body.append(conflict);
      let rejected=false;try{assertDay(dom(),'2026-11-01')}catch{rejected=true}conflict.remove();if(!rejected)throw Error('conflicting primary date accepted');
      // URL dates alone never establish the page date, nor do comparison inputs.
      history.replaceState(null,'','/goods/report/promotion/unit?adId=9146588221&beginDate=2026-11-01&endDate=2026-11-01');
      document.querySelector('.mainDate').closest('nav').remove();
      if(dom().context.primaryVerified)throw Error('URL or comparison trusted as statistics date');
      render(location.origin+'/goods/report/promotion/overView');
      const api={tabs:{get:async()=>({id:1,windowId:1,url:location.href,status:'complete'}),query:async()=>[{id:1}],update:async(id,change)=>{if(change.url)render(change.url)},remove:async()=>{}},scripting:{executeScript:async({func,args})=>[{result:func(...args)}]}};
      const store=createBatchStore();await store.clear();
      const driver=createBatchDriver({tabId:1,api,signal:new AbortController().signal});
      const job=await runBatch({shop:'offline-three-layer',days:1,store,driver,overviewURL:location.href,now:Date.parse('2026-11-02T01:00:00Z')});
      return {job,data:await store.export('offline-three-layer'),budgetClicks,evidence:evidence.diagnostics.dateEvidence};
    }''')
    assert result['job']['phase']=='complete',result
    assert result['job']['coverage']=={'accountDays':1,'expectedDays':1,'unitDays':2,'expectedUnitDays':2,'unavailableLinkSpendDays':1},result
    account=next(d for d in result['data']['datasets'] if d['type']=='account-day')
    units=[d for d in result['data']['datasets'] if d['type']=='unit-day']
    assert len(account['summary'])==6 and len(account['products'])==2 and len(units)==2,result
    assert len({u['adId'] for u in units})==2,result
    assert all(len(u['hourly'])==24 and len(u['dailyOverall']['metrics'])==6 and u['reconciliation']['matched'] for u in units),result
    managed=next(u for u in units if u['mode']=='全店托管')
    stable=next(u for u in units if u['mode']=='稳定成本推广')
    assert managed['validation']['financialComplete'] is False and managed['validation']['totals']['总花费(元)'] is None,result
    assert all(next(m for m in h['metrics'] if m['label']=='总花费(元)')['state']=='not-provided' for h in managed['hourly']),result
    assert stable['validation']['totals']['总花费(元)']==2400,result
    assert account['managedShared']['spend']['amountFen']==2400 and account['managedShared']['spend']['state']=='derived',result
    assert account['managedShared']['spend']['directObservation'] is False,result
    assert managed['sharedManagedGroupRef']==account['managedShared']['groupId'],result
    assert managed['recordContext']['scope']=='promotion-link' and account['recordContext']['scope']=='account',result
    assert account['managedShared']['settings']['dailyBudget']['state']=='not-collected',result
    assert managed['summarySources'] and all(x['source']=='link-table-total' for x in managed['summarySources']),result
    assert result['budgetClicks']==0
    print('PASS: mixed stable/managed browser job complete, real absent managed spend header, 24h with null cost, shared derived spend separate, unknown settings, account/link/date scopes, no allocation or ad changes')
    browser.close()
