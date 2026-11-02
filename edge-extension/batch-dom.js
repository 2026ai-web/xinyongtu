// Serialized into the merchant page. Commands only operate on report views,
// report dates, report pagination and the exact 查看详情 entrance.
export function batchReportDocument(command={action:'read'}){
 const route=location.pathname,overview='/goods/report/promotion/overView',unit='/goods/report/promotion/unit';
 if(location.protocol!=='https:'||location.hostname!=='yingxiao.pinduoduo.com'||![overview,unit].includes(route))throw Error('一键任务仅支持已确认的商品推广报表地址');
 const started=performance.now();
 const visibleCache=new WeakMap(),textCache=new WeakMap();
 const protocol='batch-dom-1',shown=e=>{if(visibleCache.has(e))return visibleCache.get(e);const v=e instanceof Element&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;visibleCache.set(e,v);return v;};
 const norm=s=>String(s||'').replace(/\s/g,'').replace(/（/g,'(').replace(/）/g,')');
 const day=v=>/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const text=e=>{if(!textCache.has(e))textCache.set(e,(e.innerText||e.textContent||'').trim());return textCache.get(e);};
 const quick=extra=>({protocol,action:command.action,performance:{durationMs:Math.round(performance.now()-started)},...extra});
 // Page roots and empty/lazy nested report scrollers are discoverable even
 // before a product or hourly row exists. Never infer coverage from scroll end.
 const scrollInfo=e=>({tag:e.tagName,className:String(e.className||'').slice(0,100),top:Math.round(e.scrollTop),left:Math.round(e.scrollLeft),maxTop:Math.max(0,e.scrollHeight-e.clientHeight),maxLeft:Math.max(0,e.scrollWidth-e.clientWidth)});
 const discoverScrollers=()=>{
  const roots=[document.scrollingElement||document.documentElement].filter(Boolean),found=[];
  const reportAnchors=[...document.querySelectorAll('table,[role="grid"],[role="table"],h1,h2,h3,h4,[role="heading"]')].filter(e=>e.matches('table,[role="grid"],[role="table"]')||/^(数据概况|数据明细)$/.test((e.textContent||'').trim()));
  for(const e of new Set([...roots,...document.querySelectorAll('main,section,div,[role="main"],[role="grid"],[role="table"]')])){
   if(e.clientHeight<20||e.clientWidth<20||e.scrollHeight<=e.clientHeight+3&&e.scrollWidth<=e.clientWidth+3)continue;
   if(!shown(e))continue;const css=getComputedStyle(e);
   const isRoot=roots.includes(e),hasReport=reportAnchors.some(a=>e===a||e.contains(a));
   if(!isRoot&&!hasReport)continue;
   if(roots.includes(e)||/auto|scroll/.test(css.overflowY+' '+css.overflowX)||/hidden/.test(css.overflowX)&&e.scrollWidth>e.clientWidth+3)found.push(e);
  }
  if(found.length>64)throw Error('可滚动区域超过64个，无法确认完整遍历');return found;
 };
 if(command.action==='scroll-init'){
  const targets=discoverScrollers();globalThis.__xinyongtuBatchScroll={targets,settled:0};
  for(const e of targets)e.scrollTo({top:0,left:0,behavior:'instant'});
  return quick({kind:'scroll-ready',scroll:{targets:targets.map(scrollInfo)}});
 }
 if(command.action==='scroll-next'){
  const state=globalThis.__xinyongtuBatchScroll;if(!state)throw Error('扫描滚动状态失效');if(command.recheck)state.finished=false;if(state.finished)return quick({kind:'end'});
  // Newly mounted virtual/lazy tables are found when known scrollers finish.
  let target=state.targets.find(e=>e.isConnected&&(e.scrollLeft+e.clientWidth<e.scrollWidth-3||e.scrollTop+e.clientHeight<e.scrollHeight-3));
  if(!target){for(const e of discoverScrollers())if(!state.targets.includes(e))state.targets.push(e);target=state.targets.find(e=>e.isConnected&&(e.scrollLeft+e.clientWidth<e.scrollWidth-3||e.scrollTop+e.clientHeight<e.scrollHeight-3));}
  if(!target){state.settled++;state.finished=state.settled>=3;return quick({kind:state.finished?'end':'settling',scroll:{targets:state.targets.filter(e=>e.isConnected).map(scrollInfo)}});}
  state.settled=0;const before=scrollInfo(target);
  if(target.scrollLeft+target.clientWidth<target.scrollWidth-3)target.scrollTo({left:Math.min(before.maxLeft,target.scrollLeft+Math.max(100,target.clientWidth*.75)),top:target.scrollTop,behavior:'instant'});
  else target.scrollTo({left:0,top:Math.min(before.maxTop,target.scrollTop+Math.max(100,target.clientHeight*.75)),behavior:'instant'});
  const after=scrollInfo(target);if(before.top===after.top&&before.left===after.left)return quick({kind:'blocked',error:'滚动区域未响应，不能确认完整采集',scroll:{before,after}});
  return quick({kind:'scrolled',scroll:{before,after,targetCount:state.targets.length}});
 }
 // Switching presentation must not parse rows or rebuild metric headers.
 if(command.action==='table'){
  const candidates=[...document.querySelectorAll('button,a,span,div,[role="button"]')].filter(e=>{
   if((e.textContent||'').length>12||norm(e.textContent)!=='表格'||!shown(e))return false;
   if([...e.children].some(c=>norm(c.textContent)==='表格'&&shown(c)))return false;
   let p=e;for(let i=0;p&&i<6;i++,p=p.parentElement){const raw=p.textContent||'';if(raw.length>200)break;if(norm(raw).includes('趋势图')&&norm(raw).length<100)return true;}return false;
  });
  if(candidates.length!==1)throw Error('未唯一识别数据概况中的表格按钮');
  const parseMs=performance.now()-started,clickStarted=performance.now();candidates[0].click();
  return {protocol,action:command.action,kind:'table-requested',performance:{durationMs:Math.round(parseMs),actionDurationMs:Math.round(performance.now()-clickStarted)}};
 }
 const datedInputs=[...document.querySelectorAll('input')].filter(e=>e.type!=='password'&&shown(e)&&/^20\d{2}[/-]\d{1,2}[/-]\d{1,2}/.test(e.value));
 const dateValues=inputs=>inputs.flatMap(e=>[...e.value.matchAll(/20\d{2}[/-]\d{1,2}[/-]\d{1,2}/g)].map(m=>m[0].replace(/\//g,'-').split('-').map((s,i)=>i?s.padStart(2,'0'):s).join('-')));
 // Classify each control locally: comparison inputs must never poison the
 // statistics date, and a URL date alone cannot verify rendered data.
 const dateEvidence=datedInputs.map(input=>{
  const hint=[input.getAttribute('aria-label'),input.name,input.placeholder].filter(Boolean).join(' ');
  let role=/对比|compare|comparison/i.test(hint)?'comparison':/豁免|exempt/i.test(hint)?'auxiliary':/统计日期|推广日期|statistic|promotion.?date/i.test(hint)?'primary':'unknown';
  let source=role==='unknown'?'unclassified':'control-label';
  if(role==='unknown')for(let p=input.parentElement,n=0;p&&p!==document.body&&n<9;n++,p=p.parentElement){
   const local=norm(text(p)),inputs=datedInputs.filter(e=>p.contains(e));if(local.length>1500)break;
   if(inputs.length<=2&&/对比日期|对比时间/.test(local)&&!['今日','昨日','近7','近30','近90'].some(x=>local.includes(x))){role='comparison';source='comparison-group';break;}
   if(inputs.length<=2&&/豁免/.test(local)){role='auxiliary';source='auxiliary-group';break;}
   if(inputs.length<=2&&(['今日','昨日','近7','近30','近90'].filter(x=>local.includes(x)).length>=3||/统计日期|推广日期/.test(local))){role='primary';source='statistics-group';break;}
  }
  return {input,role,source,values:dateValues([input])};
 });
 const mainControls=dateEvidence.filter(e=>e.role==='primary');
 const primary=mainControls.length?{inputs:mainControls.map(e=>e.input),values:mainControls.flatMap(e=>e.values)}:null;
 const dates=primary?[...new Set(primary.values)].sort():[];
 const primaryVerified=Boolean(primary)&&dates.length<=2&&dates.every(day)&&mainControls.every(e=>e.values.length>0)&&dates.length>0;
 const url=new URL(location.href),adId=url.searchParams.get('adId'),ids=[...new Set([...(document.body.innerText||'').matchAll(/商品\s*ID\s*[:：]\s*(\d{6,20})/gi)].map(m=>m[1]))];
 const modeNames=['全部','稳定成本推广','全店托管'];
 // Build one small label index per invocation, never rescan the document per row/column.
 const columns=['点击率','点击转化率','成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数','每笔净成交花费(元)','成交笔数','曝光量','点击量'];
 const labelAliases=new Map(columns.flatMap(label=>[[label,label],...(label.endsWith('(元)')?[[label.slice(0,-3),label]]:[])]));
 const canonicalLabel=raw=>labelAliases.get(norm(raw).replace(/[：:]$/,''))||null;
 const summaryLabels=new Map();
 const labelIndex=new Map();
 const wantedLabels=new Set(['全部','稳定成本推广','全店托管','表格','查看详情','成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数','每笔净成交花费(元)','成交笔数','曝光量','点击量','点击率','点击转化率']);
 for(const e of document.querySelectorAll('button,a,span,div,p,label,dt,dd,strong,b,em,small,h1,h2,h3,h4,[role="button"],[role="tab"]')){
  const raw=e.textContent||'';
  const direct=[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('');
  const display=raw.length<=80&&canonicalLabel(raw)?norm(raw):canonicalLabel(direct)?norm(direct):null;
  if(display&&shown(e)){const name=canonicalLabel(display);if(![...e.children].some(c=>canonicalLabel(c.textContent||'')===name&&shown(c))){if(!summaryLabels.has(name))summaryLabels.set(name,[]);summaryLabels.get(name).push({e,display});}}
  if(raw.length>80)continue;const label=norm(raw);if(!wantedLabels.has(label)||!shown(e)||norm(text(e))!==label)continue;
  if([...e.children].some(c=>norm(c.textContent)===label&&shown(c)))continue;
  if(!labelIndex.has(label))labelIndex.set(label,[]);labelIndex.get(label).push(e);
 }
 const exactElements=label=>labelIndex.get(label)||[];
 const modeGroups=[];
 for(const e of exactElements('全部')){let p=e.parentElement;for(let i=0;p&&p!==document.body&&i<4;i++,p=p.parentElement){if(norm(text(p)).length<90&&modeNames.every(x=>norm(text(p)).includes(x))){modeGroups.push({e,p});break;}}}
 let selectedMode=null;
 for(const name of modeNames)for(const e of exactElements(name))if(modeGroups.some(g=>g.p.contains(e))){let p=e;for(let n=0;p&&n<3;n++,p=p.parentElement){if(p===modeGroups.find(g=>g.p.contains(e))?.p)break;if(p.getAttribute('aria-selected')==='true'||/(?:^|[\s_-])(active|selected)(?:$|[\s_-])/i.test(String(p.className))){selectedMode=name;break;}}
  if(!selectedMode){const rgb=getComputedStyle(e).color.match(/\d+/g)?.slice(0,3).map(Number);if(rgb&&rgb[2]-rgb[0]>70&&rgb[2]-rgb[1]>50)selectedMode=name;}
 }
 const value=(s,label)=>{s=String(s||'').trim();if(/^[-—–]$/.test(s))return {current:null,state:'not-provided'};const m=/^[¥￥]?(-?\d[\d,]*(?:\.\d+)?)(?:\s*(万|亿))?(\s*%)?/.exec(s);if(!m)return {current:null,state:'missing'};if(m[3])return /率$/.test(label)?{current:m[1]+'%',state:'exact'}:{current:null,state:'wrong-unit'};if(/投产比/.test(label)&&m[2])return {current:null,state:'wrong-unit'};return {current:m[1]+(m[2]||''),state:m[2]?'abbreviated':'exact'};};
 const rowSelector='tr,[role="row"],[class*="table-row"],[class*="TableRow"]';
 const rows=[...document.querySelectorAll(rowSelector)].filter(shown);
 const headerGroups=[];
 for(const e of document.querySelectorAll('thead tr,[role="row"],[class*="table-header"],[class*="TableHeader"]'))if(shown(e)&&!(/商品\s*ID/.test(text(e)))){
  const cells=[...e.querySelectorAll('th,[role="columnheader"]')].filter(c=>!/(?:^|\s)(?:anq|ant|rc)-table-cell-scrollbar(?:\s|$)/.test(String(c.className)));if(cells.length<2)continue;headerGroups.push({e,cells,labels:cells.map(c=>canonicalLabel(norm(text(c)).replace(/[▲▼↑↓↕]/g,'')))});
 }
 const diagnostics={route,dateControlCount:datedInputs.length,primaryDates:dates,dateEvidence:dateEvidence.map(({role,source,values})=>({role,source,values})),selectedMode,headerGroups:headerGroups.map(g=>g.labels),headerStructure:headerGroups.map(g=>({columns:g.cells.length,rawCells:[...g.e.querySelectorAll('th,[role="columnheader"]')].map(c=>({className:String(c.className).slice(0,100),colSpan:c.colSpan||1}))})),calendar:[],missing:[]};
 const computeFieldsFor=row=>{
  const table=row.closest('table,[role="table"],[role="grid"]'),own=table&&headerGroups.find(g=>table.contains(g.e));
  const cells=[...row.children].filter(c=>['TD','TH'].includes(c.tagName)||['cell','gridcell'].includes(c.getAttribute('role')));
  if(own&&own.cells.length===cells.length)return own.labels.flatMap((label,i)=>label?[{label,...value(text(cells[i]),label)}]:[]);
  // Sticky headers and body may live in sibling tables. Resolve within the
  // nearest shared wrapper, requiring one unambiguous column signature.
  if(table&&cells.length>1){
   for(let wrapper=table.parentElement,depth=0;wrapper&&wrapper!==document.body&&depth<6;wrapper=wrapper.parentElement,depth++){
    const groups=headerGroups.filter(h=>wrapper.contains(h.e)&&h.cells.length===cells.length);
    if(!groups.length)continue;
    const bodyTables=[...wrapper.querySelectorAll('table')].filter(t=>t!==table&&[...t.querySelectorAll('tbody tr')].some(r=>/商品\s*ID|^\s*\d{1,2}:00/.test(text(r))));
    const isTotal=/^(合计|总计|汇总)(数据)?(?:\(|$)/.test(norm(text(cells[0])));
    if(bodyTables.length&&!(isTotal&&bodyTables.length===1&&wrapper.matches('.anq-table-container,.ant-table-container,.rc-table-container')))break;
    const signatures=new Set(groups.map(h=>JSON.stringify(h.labels)));
    if(signatures.size===1)return groups[0].labels.flatMap((label,i)=>label?[{label,...value(text(cells[i]),label)}]:[]);
    break;
   }
  }
  const r=row.getBoundingClientRect(),g=headerGroups.filter(h=>h.e.getBoundingClientRect().bottom<=r.top+3).sort((a,b)=>b.e.getBoundingClientRect().bottom-a.e.getBoundingClientRect().bottom)[0];if(!g)return [];
  const horizontal=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement)if(p.scrollWidth>p.clientWidth+5&&/scroll|auto|hidden/.test(getComputedStyle(p).overflowX))return p;return document.scrollingElement;};
  if(Math.abs(horizontal(g.e).scrollLeft-horizontal(row).scrollLeft)>2)return [];
  const out=[];for(let i=0;i<g.cells.length;i++){const label=g.labels[i];if(!label)continue;const h=g.cells[i].getBoundingClientRect();const candidates=[...row.querySelectorAll('td,div,span')].filter(e=>shown(e)&&!e.children.length).filter(e=>{const t=e.getBoundingClientRect(),x=(t.left+t.right)/2;return x>=h.left&&x<=h.right&&t.top>=r.top-1&&t.bottom<=r.bottom+1;}).map(e=>value(text(e),label)).filter(v=>v.state!=='missing');if(candidates.length===1)out.push({label,...candidates[0]});}return out;
 };
 const fieldsCache=new WeakMap(),fieldsFor=row=>{if(!fieldsCache.has(row))fieldsCache.set(row,computeFieldsFor(row));return fieldsCache.get(row);};
 const safeUnitURL=href=>{try{const u=new URL(href,location.href);if(u.origin!==location.origin||u.pathname!==unit||!/^\d{6,20}$/.test(u.searchParams.get('adId')||''))return null;const safe=new URL(unit,u.origin);for(const key of ['adId','beginDate','endDate','scenesMode']){const v=u.searchParams.get(key);if(v&&((key.includes('Date')&&day(v))||(/Id$/.test(key)&&/^\d{6,20}$/.test(v))||(key==='scenesMode'&&/^\d{1,2}$/.test(v))))safe.searchParams.set(key,v);}return safe.href;}catch{return null;}};
 // Header/body wrappers may be separate; accept only a clean band of known labels.
 for(const label of columns)for(const e of exactElements(label)){
  if(e.closest('thead,[role="columnheader"]'))continue;
  let group=e.parentElement;for(let depth=0;group&&group!==document.body&&depth<6;depth++,group=group.parentElement){
   const members=columns.flatMap(l=>exactElements(l).filter(x=>group.contains(x)).map(x=>({e:x,label:l})));
   if(new Set(members.map(x=>x.label)).size<2)continue;const content=text(group);
   if(content.length>1800||/商品\s*ID/.test(content)||[...group.querySelectorAll('*')].some(x=>!x.children.length&&/^\s*[-¥￥]?\d/.test(text(x))))break;
   if(!headerGroups.some(g=>g.e===group)){const ordered=members.map(m=>{let c=m.e;while(c.parentElement&&c.parentElement!==group&&!members.some(other=>other.label!==m.label&&c.parentElement.contains(other.e)))c=c.parentElement;return {cell:c,label:m.label};}).sort((a,b)=>a.cell.getBoundingClientRect().left-b.cell.getBoundingClientRect().left);headerGroups.push({e:group,cells:ordered.map(x=>x.cell),labels:ordered.map(x=>x.label)});}break;
  }
 }
 const products=[];for(const row of rows){const matches=[...new Set([...text(row).matchAll(/商品\s*ID\s*[:：]\s*(\d{6,20})/gi)].map(m=>m[1]))];if(matches.length!==1)continue;const productId=matches[0],s=norm(text(row)),modes=['稳定成本推广','全店托管'].filter(x=>s.includes(x));if(modes.length!==1){diagnostics.missing.push('商品 '+productId+' 的推广模式未唯一识别');continue;}const mode=modes[0];const detail=exactElements('查看详情').filter(e=>row.contains(e));const href=detail.length===1?safeUnitURL(detail[0].closest('a')?.getAttribute('href')||''):null;products.push({productId,mode,adId:href?new URL(href).searchParams.get('adId'):null,unitURL:href,metrics:fieldsFor(row),detailsAvailable:detail.length===1});}
 const hourly=[];for(const row of rows){const raw=text(row),m=/^\s*(\d{1,2}):00\s*[~～至—–-]\s*(\d{1,2}):(00|59)/.exec(raw);if(!m)continue;const hour=Number(m[1]);if(hour>23||!(Number(m[2])===hour+1&&m[3]==='00'||Number(m[2])===hour&&m[3]==='59'))continue;hourly.push({hour,metrics:fieldsFor(row)});}
 // Read displayed overall cards independently of table/hourly totals.
 // Accept one current value immediately following a label; do not invent totals.
 const summary=[],summaryEvidence=[],overallTotalRows=[],detailTotalRows=[],overviewTotalElements=new Set();
 for(const row of rows){
  const first=row.children[0];if(!first||!/^(合计|总计|汇总)(数据)?(?:\(|$)/.test(norm(text(first))))continue;
  const table=row.closest('table,[role="table"],[role="grid"]');if(!table)continue;
  let members=rows.filter(r=>r.closest('table,[role="table"],[role="grid"]')===table);
  let hasHours=members.some(r=>/^\s*\d{1,2}:00/.test(text(r))),hasProducts=members.some(r=>/商品\s*ID/.test(text(r)));
  if(!hasHours&&!hasProducts){const wrapper=table.closest('.anq-table-container,.ant-table-container,.rc-table-container');if(wrapper){members=rows.filter(r=>wrapper.contains(r));hasHours=members.some(r=>/^\s*\d{1,2}:00/.test(text(r)));hasProducts=members.some(r=>/商品\s*ID/.test(text(r)));}}
  const record={metrics:fieldsFor(row),tag:row.tagName,className:String(row.className||'').slice(0,100)};
  if(hasHours&&!hasProducts){overallTotalRows.push(record);overviewTotalElements.add(row);}else if(hasProducts&&!hasHours)detailTotalRows.push(record);
 }

 diagnostics.totalRows={scope:route===unit?'promotion-link':'account',overview:overallTotalRows,detail:detailTotalRows};
 for(const label of columns){
  const candidates=[];
  for(const {e,display} of summaryLabels.get(label)||[]){
   if(e.closest(rowSelector)||e.closest('thead,[role="columnheader"]'))continue;
   for(let p=e.parentElement,depth=0;p&&p!==document.body&&depth<5;depth++,p=p.parentElement){
    const raw=norm(text(p));if(raw.length>500||p.querySelector('table,[role="table"],[role="grid"]'))break;
    if([...summaryLabels].some(([other,entries])=>other!==label&&entries.some(item=>p.contains(item.e))))break;
    const at=raw.indexOf(display);if(at<0)continue;
    // Current values can be split across currency/integer/fraction spans or
    // be direct text nodes. Comparison values must never replace the first value.
    const rest=raw.slice(at+display.length).replace(/^[：:]/,'');
    const m=/^([¥￥]?-?\d[\d,]*(?:\.\d+)?(?:万|亿|%)?|[-—–])(?:元|次|笔)?(?=$|[^\d.,万亿%])/.exec(rest);
    if(!m){if(rest)summaryEvidence.push({label,state:'unrecognized-current-value',tag:p.tagName,className:String(p.className||'').slice(0,100)});continue;}
    const parsed=value(m[1],label);if(parsed.state!=='missing')candidates.push({label,...parsed});break;
   }
  }
  const tableCandidates=overallTotalRows.flatMap(r=>r.metrics.filter(m=>m.label===label));
  if(tableCandidates.length===1)summary.push(tableCandidates[0]);
  else diagnostics.missing.push('数据概况表格合计行缺失或不唯一：'+label);
  summaryEvidence.push({label,tableCandidates:tableCandidates.length,source:tableCandidates.length===1?(route===unit?'link-table-total':'overview-table-total'):null,labelMatches:(summaryLabels.get(label)||[]).length,cardLabels:(summaryLabels.get(label)||[]).filter(({e})=>!e.closest(rowSelector)&&!e.closest('thead,[role="columnheader"]')).map(({e,display})=>({tag:e.tagName,display,className:String(e.className||'').slice(0,100),ancestors:(()=>{const out=[];for(let p=e.parentElement;p&&p!==document.body&&out.length<4;p=p.parentElement)out.push({tag:p.tagName,className:String(p.className||'').slice(0,100),childTags:[...p.children].slice(0,12).map(c=>c.tagName)});return out;})()})).slice(0,3),candidates:candidates.length});
 }
 diagnostics.summaryEvidence=summaryEvidence;
 // Only product counts drive pagination. The overview's 24-hour total
 // may also say 合计数据(24条), which is not the number of promotion links.
 const counts=[...new Set([...document.querySelectorAll('p,span,div,td')].filter(e=>{
  const raw=e.textContent||'';if(!(raw.length<80&&/^(?:合计数据\(?|共)\d+条\)?$/.test(norm(raw))&&shown(e))||overviewTotalElements.has(e.closest(rowSelector)))return false;const table=e.closest('table,[role="table"],[role="grid"]');if(!table)return true;const region=table.closest('.anq-table-container,.ant-table-container,.rc-table-container')||table;return rows.some(r=>region.contains(r)&&/商品\s*ID/.test(text(r)));
 }).flatMap(e=>{const m=/^(?:合计数据\(?|共)(\d+)条\)?$/.exec(norm(text(e)));return m?[Number(m[1])]:[];}))];
 const expectedRows=counts.length===1?counts[0]:null;

 const context={route,origin:location.origin,dates,primaryVerified,selectedMode,loading:[...document.querySelectorAll('[aria-busy="true"],[class*="loading-mask"],[class*="loadingMask"],[class*="spin-spinning"]')].some(shown),productId:route===unit&&ids.length===1?ids[0]:null,adId:route===unit&&/^\d{6,20}$/.test(adId||'')?adId:null,beginDate:url.searchParams.get('beginDate'),endDate:url.searchParams.get('endDate'),scenesMode:url.searchParams.get('scenesMode')};
 const essential=['交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量'];
 const hourHeaders=headerGroups.filter(g=>essential.every(label=>g.labels.includes(label)));
 const fieldAvailability={totalSpend:{state:route===unit&&hourly.length&&hourHeaders.length?(hourHeaders.some(g=>g.labels.includes('总花费(元)'))?'present':'not-provided'):'unknown',basis:'observed-report-headers',scope:route===unit?'promotion-link':'account',headerSignatures:hourHeaders.map(g=>g.labels)}};
 const response=extra=>({fieldAvailability,protocol,action:command.action,context,summary,products,hourly,expectedRows,diagnostics,performance:{durationMs:Math.round(performance.now()-started)},...extra});
 if(command.action==='read'){diagnostics.unmatchedRows=rows.filter(r=>/商品\s*ID|^\s*\d{1,2}:00/.test(text(r))&&fieldsFor(r).length===0).slice(0,3).map(r=>({tag:r.tagName,cellCount:r.children.length,cellTags:[...r.children].map(c=>c.tagName),ancestorTags:(()=>{const a=[];for(let p=r.parentElement;p&&a.length<6;p=p.parentElement)a.push({tag:p.tagName,role:p.getAttribute('role'),className:String(p.className).slice(0,120)});return a;})()}));return response({});}
 if(command.action==='all-mode'){if(route!==overview)throw Error('不能在单元页切换账户模式');if(selectedMode==='全部')return response({kind:'already-selected'});if(!modeGroups.length)throw Error('未唯一识别报表“全部”模式控件');modeGroups[0].e.click();return response({kind:'mode-requested'});}
 if(command.action==='open-details'){
  const matches=products.filter(p=>p.productId===command.productId&&p.mode===command.mode);if(matches.length!==1||!matches[0].detailsAvailable)throw Error('查看详情入口不唯一或未出现在当前页');if(matches[0].unitURL)return response({kind:'unit-link',url:matches[0].unitURL});const row=rows.find(r=>text(r).match(new RegExp('商品\\s*ID\\s*[:：]\\s*'+command.productId))&&norm(text(r)).includes(command.mode));exactElements('查看详情').find(e=>row.contains(e)).click();return response({kind:'details-clicked'});
 }
 if(command.action==='first-page'){
  const containers=[...document.querySelectorAll('nav,[role="navigation"],[class*="pagination"],[class*="Pagination"]')].filter(shown);
  const controls=containers.flatMap(c=>[...c.querySelectorAll('button,a,li,[role="button"]')]).filter(e=>shown(e)&&norm(text(e))==='1'&&!e.querySelector('button,a,[role="button"]')&&!e.disabled&&!/disabled/i.test(String(e.className)));
  const unique=[...new Set(controls)];if(unique.length>1)throw Error('报表第一页入口不唯一');if(unique.length)unique[0].click();return response({kind:unique.length?'first-page-requested':'no-pagination'});
 }
 if(command.action==='page'){
  if(!Number.isInteger(command.page)||command.page<1||command.page>100)throw Error('分页参数无效');
  const containers=[...document.querySelectorAll('nav,[role="navigation"],[class*="pagination"],[class*="Pagination"]')].filter(shown);const controls=[];for(const c of containers)for(const e of c.querySelectorAll('button,a,li,[role="button"]'))if(shown(e)&&norm(text(e))===String(command.page)&&!e.querySelector('button,a,[role="button"]')&&!e.disabled&&!/disabled/i.test(String(e.className)))if(!controls.includes(e))controls.push(e);
  if(controls.length!==1)throw Error('未找到唯一明确的报表页码 '+command.page);controls[0].click();return response({kind:'page-requested'});
 }
 if(command.action==='date-step'){
  const start=command.start,end=command.end||start;
  if(!day(start)||!day(end)||start>end)throw Error('统计日期无效');if(!primaryVerified)throw Error('未确认主统计日期控件，未操作对比日期');
  const key=route+'|'+(adId||'account')+'|'+start+'|'+end;
  let state=globalThis.__xinyongtuBatchDate;
  if(command.reset||!state||state.key!==key)state=globalThis.__xinyongtuBatchDate={key,inputs:[...primary.inputs],phase:'start',opened:false,openAttempts:0,steps:0};
  state.steps++;if(state.steps>120)throw Error('日期选择超过120步，未确认生效');
  const wanted=state.phase==='start'?start:end;
  const calendarNode=e=>!e.matches('input')&&(e.matches('td,button,a,[role="gridcell"],[data-date],[datetime]')||Boolean(e.closest('td,[role="gridcell"]')));
  const allPanels=[...document.querySelectorAll('[role="dialog"],[role="grid"][aria-label*="日期"],[role="grid"][aria-label*="calendar"],[class*="picker-dropdown"],[class*="picker-panel"],[class*="pickerPanel"],[class*="Picker"],[class*="calendar"],[class*="Calendar"]')].filter(shown).filter(e=>[...e.querySelectorAll('[title],[data-date],[datetime]')].some(n=>calendarNode(n)&&[n.getAttribute('title'),n.getAttribute('data-date'),n.getAttribute('datetime')].some(v=>v&&day(v.replace(/\//g,'-')))));
  const panels=allPanels.filter(e=>!allPanels.some(p=>p!==e&&p.contains(e)));
  const exact=dates.length>0&&dates[0]===start&&dates.at(-1)===end;
  diagnostics.dateSelection={requested:{start,end},phase:state.phase,steps:state.steps,openAttempts:state.openAttempts,rendered:dates,panelCount:panels.length,controls:primary.inputs.map(e=>({type:e.type,readOnly:e.readOnly,disabled:e.disabled,wrapperTag:e.parentElement?.tagName,wrapperClass:String(e.parentElement?.className||'').slice(0,100)}))};
  const result=extra=>{diagnostics.dateSelection.phase=state.phase;diagnostics.dateSelection.openAttempts=state.openAttempts;return response({dateSelection:diagnostics.dateSelection,...extra});};
  if(exact&&!panels.length){state.phase='done';return result({kind:'date-selected'});}
  // Native date inputs are the only inputs assigned directly. Text/readonly
  // framework pickers are operated through their visible calendar controls.
  if(primary.inputs.every(e=>e.type==='date'&&!e.readOnly)){
   for(let i=0;i<primary.inputs.length;i++){const e=primary.inputs[i],value=i===0?start:end;if(e.value===value)continue;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
   return result({kind:'native-date-requested'});
  }
  const confirms=panels.flatMap(p=>[...p.querySelectorAll('button,a,[role="button"]')]).filter(e=>shown(e)&&/^(确定|应用|查询|OK|Apply)$/.test(text(e))&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');
  if((state.phase==='confirm'||exact&&state.opened)&&confirms.length){
   if(confirms.length!==1)throw Error('日历确认按钮不唯一，未猜测');
   confirms[0].click();state.phase='verify';return result({kind:'date-confirm-requested'});
  }
  if(state.phase==='verify'){
   if(state.steps<120)return result({kind:'date-awaiting-readback'});
   throw Error('日期操作后未回读到目标单日，未保存数据');
  }
  const range=primary.inputs.length===2||primary.values.length>1||Boolean(primary.inputs[0].closest('[class*="picker-range"],[class*="PickerRange"]'));
  if(state.opened&&panels.length){
   const rawNodes=panels.flatMap(p=>[...p.querySelectorAll('[title],[data-date],[datetime]')]).filter(e=>calendarNode(e)&&shown(e)&&!e.closest('[disabled],[aria-disabled="true"],.anq-picker-cell-disabled,.ant-picker-cell-disabled,.rc-picker-cell-disabled')&&!/disabled/i.test(String(e.className))).filter(e=>[e.getAttribute('title'),e.getAttribute('data-date'),e.getAttribute('datetime')].some(v=>v&&v.replace(/\//g,'-')===wanted));
   let nodes=[...new Set(rawNodes)].filter(e=>!rawNodes.some(child=>child!==e&&e.contains(child)));
   if(nodes.length>1){const inMonth=nodes.filter(e=>{const cell=e.closest('td,[role="gridcell"]')||e;return /cell-in-view|current-month/.test(String(cell.className))||cell.getAttribute('data-current-month')==='true';});if(inMonth.length===1)nodes=inMonth;}
   diagnostics.calendar=panels.map(p=>({tag:p.tagName,className:String(p.className||'').slice(0,100),dates:[...new Set([...p.querySelectorAll('[title],[data-date],[datetime]')].flatMap(e=>[e.getAttribute('title'),e.getAttribute('data-date'),e.getAttribute('datetime')].filter(v=>v&&day(v.replace(/\//g,'-')))))].slice(0,65)}));
   if(nodes.length===1){nodes[0].click();state.phase=state.phase==='start'&&range?'end':'confirm';state.openAttempts=0;return result({kind:'date-cell-selected',selected:wanted});}
   if(nodes.length>1)throw Error('目标日期单元格不唯一，未猜测');
   const months=[...new Set(panels.flatMap(p=>[...norm(text(p)).matchAll(/(20\d{2})[年/-](\d{1,2})(?:月|$)/g)].map(m=>m[1]+'-'+m[2].padStart(2,'0'))))].sort();
   diagnostics.dateSelection.displayedMonths=months;
   const direction=months.length?(wanted.slice(0,7)<months[0]?'prev':wanted.slice(0,7)>months.at(-1)?'next':null):null;
   if(direction){const nav=panels.flatMap(p=>[...p.querySelectorAll('button,a,[role="button"]')]).filter(e=>shown(e)&&!e.disabled).filter(e=>{const name=[e.getAttribute('aria-label'),e.getAttribute('title'),text(e)].filter(Boolean).join(' ');return direction==='prev'?/上一月|上个月|前一月|previous month|prev.*month/i.test(name):/下一月|下个月|后一月|next.*month/i.test(name);});if(nav.length){(direction==='prev'?nav[0]:nav.at(-1)).click();return result({kind:'calendar-month-requested',direction});}}
   return result({kind:'unsupported-calendar',error:'已打开日期控件，但未唯一识别目标日期或月份入口'});
  }
  // React range pickers commonly open on mousedown/focus, not input.click().
  if(state.openAttempts>=3)throw Error('主日期控件未打开日历，已停止重复点击；请导出日期诊断');
  const index=state.phase==='end'&&primary.inputs.length===2?1:0,input=primary.inputs[index];
  let target=input;if(state.openAttempts===2)target=input.closest('[class*="picker-range"],[class*="picker"],[role="combobox"]')||input;
  target.scrollIntoView({block:'center'});target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse'}));target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));input.focus();target.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse'}));target.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));target.click();
  state.opened=true;state.openAttempts++;return result({kind:'calendar-requested',inputIndex:index});
 }
 throw Error('不支持的报表采集动作');
}
