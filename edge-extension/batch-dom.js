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
 if(command.action==='scroll-next'){const state=globalThis.__xinyongtuBatchScroll;if(!state)throw Error('扫描滚动状态失效');while(state.index<state.targets.length){const e=state.targets[state.index];if(e.isConnected&&e.scrollLeft+e.clientWidth<e.scrollWidth-3){e.scrollLeft+=Math.max(100,e.clientWidth*.75);return quick({kind:'scrolled'});}if(e.isConnected&&e.scrollTop+e.clientHeight<e.scrollHeight-3){e.scrollLeft=0;e.scrollTop+=Math.max(100,e.clientHeight*.75);return quick({kind:'scrolled'});}state.index++;}return quick({kind:'end'});}
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
 const primaryCandidates=[];
 for(const input of datedInputs){let p=input.parentElement;for(let n=0;p&&p!==document.body&&n<9;n++,p=p.parentElement){const s=norm(text(p));const inputs=datedInputs.filter(e=>p.contains(e));if(s.length>1500)break;if(inputs.length<=4&&['今日','昨日','近7','近30','近90'].filter(x=>s.includes(x)).length>=3){primaryCandidates.push({inputs,values:dateValues(inputs)});break;}}}
 const primary=primaryCandidates[0]||null,dates=primary?[...new Set(primary.values)]:[];
 const url=new URL(location.href),adId=url.searchParams.get('adId'),ids=[...new Set([...(document.body.innerText||'').matchAll(/商品\s*ID\s*[:：]\s*(\d{6,20})/gi)].map(m=>m[1]))];
 const modeNames=['全部','稳定成本推广','全店托管'];
 // Build one small label index per invocation, never rescan the document per row/column.
 const labelIndex=new Map();
 const wantedLabels=new Set(['全部','稳定成本推广','全店托管','表格','查看详情','成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数','每笔净成交花费(元)','成交笔数','曝光量','点击量']);
 for(const e of document.querySelectorAll('button,a,span,div,[role="button"],[role="tab"]')){
  const raw=e.textContent||'';if(raw.length>80)continue;const label=norm(raw);if(!wantedLabels.has(label)||!shown(e)||norm(text(e))!==label)continue;
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
 const columns=['成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数','每笔净成交花费(元)','成交笔数','曝光量','点击量'];
 const value=(s,label)=>{s=String(s||'').trim();if(/^[-—–]$/.test(s))return {current:null,state:'not-provided'};const m=/^[¥￥]?(-?\d[\d,]*(?:\.\d+)?)(?:\s*(万|亿))?(\s*%)?/.exec(s);if(!m)return {current:null,state:'missing'};if(m[3])return {current:null,state:'wrong-unit'};if(/投产比/.test(label)&&m[2])return {current:null,state:'wrong-unit'};return {current:m[1]+(m[2]||''),state:m[2]?'abbreviated':'exact'};};
 const rowSelector='tr,[role="row"],[class*="table-row"],[class*="TableRow"]';
 const rows=[...document.querySelectorAll(rowSelector)].filter(shown);
 const headerGroups=[];
 for(const e of document.querySelectorAll('thead tr,[role="row"],[class*="table-header"],[class*="TableHeader"]'))if(shown(e)&&!(/商品\s*ID/.test(text(e)))){
  const cells=[...e.querySelectorAll('th,[role="columnheader"]')];if(cells.length<2)continue;headerGroups.push({e,cells,labels:cells.map(c=>columns.find(l=>norm(text(c)).replace(/[▲▼↑↓↕]/g,'')===l)||null)});
 }
 const diagnostics={route,dateControlCount:datedInputs.length,primaryDates:dates,selectedMode,headerGroups:headerGroups.map(g=>g.labels),calendar:[],missing:[]};
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
    if(bodyTables.length)break;
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
 const counts=[...new Set([...norm(document.body.innerText).matchAll(/(?:合计数据\(?|共)(\d+)条/g)].map(m=>Number(m[1])))];const expectedRows=counts.length===1?counts[0]:null;
 const context={route,origin:location.origin,dates,primaryVerified:Boolean(primary)&&primaryCandidates.every(c=>JSON.stringify([...new Set(c.values)])===JSON.stringify(dates)),selectedMode,loading:[...document.querySelectorAll('[aria-busy="true"],[class*="loading-mask"],[class*="loadingMask"],[class*="spin-spinning"]')].some(shown),productId:route===unit&&ids.length===1?ids[0]:null,adId:route===unit&&/^\d{6,20}$/.test(adId||'')?adId:null,beginDate:url.searchParams.get('beginDate'),endDate:url.searchParams.get('endDate'),scenesMode:url.searchParams.get('scenesMode')};
 const response=extra=>({protocol,action:command.action,context,products,hourly,expectedRows,diagnostics,performance:{durationMs:Math.round(performance.now()-started)},...extra});
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
 if(command.action==='scroll-init'){
  const ancestors=new Set([document.scrollingElement]);for(const row of rows)for(let p=row.parentElement;p&&p!==document.body;p=p.parentElement)ancestors.add(p);
  const targets=[...ancestors].filter(e=>true&&shown(e)&&((e.scrollHeight>e.clientHeight+4&&/auto|scroll|hidden/.test(getComputedStyle(e).overflowY))||(e.scrollWidth>e.clientWidth+4&&/auto|scroll|hidden/.test(getComputedStyle(e).overflowX)))&&(/商品\s*ID|\d{1,2}:00/.test(text(e))));globalThis.__xinyongtuBatchScroll={targets:targets.slice(0,6),index:0};for(const e of targets.slice(0,6))e.scrollTo({top:0,left:0,behavior:'instant'});return response({kind:'scroll-ready'});
 }
 if(command.action==='date-step'){
  const start=command.start,end=command.end||start;if(!day(start)||!day(end)||start>end)throw Error('统计日期无效');if(!primary)throw Error('未确认主统计日期控件，未操作对比日期');
  const openCalendars=[...document.querySelectorAll('[role="dialog"],[class*="calendar"],[class*="Calendar"],[class*="picker-dropdown"],[class*="picker-panel"],[class*="pickerPanel"]')].filter(shown).filter(e=>e.querySelector('[title],[data-date],td,[role="gridcell"]'));
  if(dates[0]===start&&(dates.length===1?start===end:dates.at(-1)===end)&&!openCalendars.length)return response({kind:'date-selected'});
  if(dates[0]===start&&dates.at(-1)===end&&openCalendars.length){const confirm=openCalendars.flatMap(p=>[...p.querySelectorAll('button,a,[role="button"]')]).find(e=>shown(e)&&/^(确定|应用|查询|OK|Apply)$/.test(text(e)));if(confirm){confirm.click();return response({kind:'date-confirm-requested'});}}
  if(primary.inputs.every(e=>e.type==='date'&&!e.readOnly)&&start===end){for(const e of primary.inputs){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,start);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}return response({kind:'native-date-requested'});}
  const key=start+'|'+end;let state=globalThis.__xinyongtuBatchDate;if(!state||state.key!==key)state=globalThis.__xinyongtuBatchDate={key,clicks:0};if(state.clicks>6)throw Error('日期控件未按选择回读，已停止');
  const wanted=state.clicks===0?start:end;
  const calendars=[...document.querySelectorAll('[role="dialog"],[class*="calendar"],[class*="Calendar"],[class*="picker-dropdown"],[class*="picker-panel"],[class*="pickerPanel"]')].filter(shown).filter(e=>e.querySelector('[title],[data-date],td,[role="gridcell"]'));
  const dateNodes=[];for(const panel of calendars)for(const e of panel.querySelectorAll('[title],[data-date],[datetime]')){if(!shown(e)||e.closest('[aria-disabled="true"],[disabled]')||/disabled/i.test(String(e.className)))continue;const v=[e.getAttribute('title'),e.getAttribute('data-date'),e.getAttribute('datetime')].find(v=>v&&v.replace(/\//g,'-')===wanted);if(v&&!dateNodes.includes(e))dateNodes.push(e);}
  diagnostics.calendar=calendars.slice(0,4).map(p=>({dateCells:[...p.querySelectorAll('[title],[data-date]')].map(e=>e.getAttribute('title')||e.getAttribute('data-date')).filter(v=>/^20\d{2}[/-]\d{1,2}[/-]\d{1,2}$/.test(v||'')).slice(0,40)}));
  if(dateNodes.length){dateNodes[0].click();state.clicks++;return response({kind:'date-cell-selected'});}
  if(calendars.length){const months=[...new Set(calendars.flatMap(p=>[...text(p).matchAll(/(20\d{2})\s*[年/-]\s*(\d{1,2})\s*月?/g)].map(m=>m[1]+'-'+m[2].padStart(2,'0'))))].sort();if(months.length){const direction=wanted.slice(0,7)<months[0]?'prev':wanted.slice(0,7)>months.at(-1)?'next':null;if(direction){const nav=calendars.flatMap(p=>[...p.querySelectorAll('button,a,[role="button"]')]).filter(shown).filter(e=>{const name=[e.getAttribute('aria-label'),e.getAttribute('title'),text(e)].filter(Boolean).join(' ');return direction==='prev'?/上一月|上个月|前一月|previous month|prev.*month/i.test(name):/下一月|下个月|后一月|next.*month/i.test(name);});if(nav.length){nav[0].click();return response({kind:'calendar-month-requested'});}}}return response({kind:'unsupported-calendar',error:'日历已打开，但未找到可确认的日期单元格；已保留诊断，未猜测日期'});}
  const inputs=primary.inputs;const input=inputs[Math.min(state.clicks,inputs.length-1)];input.scrollIntoView({block:'center'});input.click();return response({kind:'calendar-requested'});
 }
 throw Error('不支持的报表采集动作');
}
