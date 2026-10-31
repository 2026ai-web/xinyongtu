export const merchantHosts = new Set(['mms.pinduoduo.com','yingxiao.pinduoduo.com']);
export function isMerchantUrl(url) { try {const u=new URL(url);return u.protocol==='https:' && merchantHosts.has(u.hostname);}catch{return false;} }

// Serialized into a page by Playwright. Read-only DOM inspection, no requests or clicks.
// Return only known promotion labels/numbers, not arbitrary page text or credentials.
export function collectPromotionDocument(options = {}) {
  if(location.protocol!=='https:' || !['mms.pinduoduo.com','yingxiao.pinduoduo.com'].includes(location.hostname))return {recognized:false,reason:'不支持的站点'};
  const labels=['总花费(元)','成交花费(元)','交易额(元)','净交易额(元)','实际投产比','净实际投产比','净成交笔数','成交笔数','每笔净成交花费(元)','曝光量','点击量','点击率','点击转化率','预算日限额(元)','净目标投产比','总预算日限额','总净目标投产比'];
  const normalize=s=>s.replace(/\s/g,'').replace(/（/g,'(').replace(/）/g,')').replace(/[：:]$/,'');
  const validMetric=(label,value)=>{
    if(/率$/.test(label))return /^-?[\d,]+(?:\.\d+)?%$/.test(value);
    if(/曝光量|点击量|成交笔数/.test(label))return /^\d[\d,]*(?:\.\d+)?(?:万|亿)?$/.test(value);
    if(/元|交易额|花费/.test(label))return /^-?\d[\d,]*(?:\.\d+)?(?:万|亿)?$/.test(value);
    return /^-?\d[\d,]*(?:\.\d+)?$/.test(value);
  };
  const horizontalScroller=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement)if(p.scrollWidth>p.clientWidth+5&&/auto|scroll|hidden/.test(getComputedStyle(p).overflowX))return p;return document.scrollingElement;};
  const rejectedMappings=[];
  const visible=e=>e instanceof Element && e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && (()=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(options.includeOffscreen || (r.bottom>0&&r.right>0))&&(options.includeOffscreen || (r.top<innerHeight&&r.left<innerWidth));})();
  const tokens=[];
  if(!document.body)return {recognized:false,reason:'页面尚未加载'};
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node,visited=0;
  while((node=walker.nextNode()) && visited++<50000) {
    const e=node.parentElement;
    if(!e || ['SCRIPT','STYLE','NOSCRIPT','TEXTAREA'].includes(e.tagName) || !visible(e))continue;
    const value=node.textContent.trim();if(value)tokens.push({e,value});
  }
  const text=tokens.map(t=>t.value).join('\n');
  const scopedText=e=>tokens.filter(t=>e.contains(t.e)).map(t=>t.value).join('\n');
  const loginVisible=tokens.some(t=>['扫码登录','账号登录','短信登录','请先登录'].includes(t.value)) || [...document.querySelectorAll('input[type=password]')].some(visible);
  if(loginVisible)return {recognized:false,reason:'当前可见登录提示，请在当前标签页完成登录后重试'};
  const knownPromotionPath=/^\/goods\/promotion(?:\/|$)/.test(location.pathname);
  if(!(knownPromotionPath||/商品推广|多多招财/.test(text)) || !/稳定成本推广|全店托管|净目标投产比/.test(text))return {recognized:false,reason:'当前可见区域未识别到多多招财，请打开推广页面'};
  const metrics=[];
  const metricElements=new Map();
  const rowSelector='tr,[role="row"],[class*="table-row"],[class*="TableRow"]';
  for(const {e,value} of tokens) {
    const label=labels.find(l=>normalize(l)===normalize(value));if(!label)continue;
    if(e.closest(rowSelector))continue; // Table rows are parsed separately; never treated as summary cards.
    let parent=e;
    for(let depth=0;parent && parent!==document.body && depth<5;depth++,parent=parent.parentElement){
      const card=tokens.filter(t=>parent.contains(t.e)).map(t=>t.value).join('\n');if(card.length>250)break;
      const marker=normalize(label), pos=card.indexOf(value);
      if(pos<0)continue;
      const rest=card.slice(pos+value.length).trimStart();
      if(labels.some(l=>normalize(l)!==marker && normalize(rest).includes(normalize(l))))break;
      // First value must immediately follow the label, not a distant table row or other field.
      const match=/^[¥￥]?(-?\d[\d,]*(?:\.\d+)?)(?:\s*(万|亿))?(?:\s*(%))?/.exec(rest);
      if(!match)continue;
      const r=e.getBoundingClientRect();
      const current=match[1]+(match[2]||'')+(match[3]||'');if(!validMetric(label,current))break;
      if(!metrics.some(m=>m.label===label && m.current===current && Math.abs(m.top-r.top)<3)){
        const metric={label,current,top:Math.round(r.top)};metrics.push(metric);metricElements.set(metric,e);
      }
      break;
    }
  }
  const dateCandidates=[...new Set([...text.matchAll(/\b20\d{2}[/-]\d{1,2}[/-]\d{1,2}\b/g)].map(m=>m[0]))].slice(0,6);
  const dateControls=[];
  for(const input of document.querySelectorAll('input')){
    if(visible(input) && /^20\d{2}[/-]\d{1,2}[/-]\d{1,2}$/.test(input.value) && !dateCandidates.includes(input.value))dateCandidates.push(input.value);
    if(!/^20\d{2}[/-]\d{1,2}[/-]\d{1,2}$/.test(input.value))continue;
    const [year,month,day]=input.value.split(/[/-]/),date=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
    const parsed=new Date(date+'T00:00:00Z');if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)continue;
    const hint=[input.getAttribute('aria-label'),input.name,input.placeholder].filter(Boolean).join(' ');
    let role='unclassified',source='unclassified';
    if(/豁免|exempt/i.test(hint)){role='auxiliary';source='control-label';}
    else if(/对比|compare|comparison/i.test(hint)){role='comparison';source='control-label';}
    else if(/统计日期|推广日期|推广统计|statistic|promotion.?date/i.test(hint)){role='primary';source='control-label';}
    if(role==='unclassified'){
      let parent=input.parentElement;
      for(let depth=0;parent&&parent!==document.body&&depth<6;depth++,parent=parent.parentElement){
        const context=(parent.innerText||'').replace(/\s/g,'');if(context.length>1000)break;
        if(/平台豁免|退款豁免|退单豁免|豁免数据/.test(context)){role='auxiliary';source='auxiliary-module';break;}
        const inputRect=input.getBoundingClientRect();
        const nearComparison=tokens.some(t=>parent.contains(t.e)&&/^(对比时间|对比日期)$/.test(t.value)&&(()=>{const r=t.e.getBoundingClientRect();return Math.abs((r.top+r.bottom-inputRect.top-inputRect.bottom)/2)<inputRect.height/2+8&&r.right<=inputRect.left+5&&inputRect.left-r.right<200;})());
        if(nearComparison){role='comparison';source='comparison-label';break;}
        const quick=['今日','昨日','近7日','近30日','近90日'].filter(label=>context.includes(label));
        if(quick.length>=3&&parent.querySelectorAll('input').length<=2){role='primary';source='promotion-quick-date-row';break;}
      }
    }
    dateControls.push({date,role,source});
  }
  // A sole date is retained as a candidate but cannot establish a verified statistics scope.
  const uniqueAll=[...new Set(dateControls.map(c=>c.date))];
  if(uniqueAll.length===1&&dateControls.every(c=>c.role==='unclassified'))for(const c of dateControls){c.role='primary';c.source='single-unclassified-candidate';}
  const datesFor=role=>[...new Set(dateControls.filter(c=>c.role===role).map(c=>c.date))].sort();
  const selectedDates=datesFor('primary');
  const dateScopes={primary:selectedDates,comparison:datesFor('comparison'),auxiliary:datesFor('auxiliary'),unclassified:datesFor('unclassified'),
    primaryVerified:selectedDates.length>0&&dateControls.filter(c=>c.role==='primary').every(c=>c.source!=='single-unclassified-candidate'),
    evidence:dateControls};
  const currentCutoffs=[],comparisonCutoffs=[];
  const compactText=text.replace(/\s/g,'');
  for(const match of compactText.matchAll(/(今日|今天|昨日|昨天)截至((?:[01]?\d|2[0-3]):[0-5]\d)/g)){
    const target=/今日|今天/.test(match[1])?currentCutoffs:comparisonCutoffs;
    if(!target.includes(match[2]))target.push(match[2]);
  }
  const dataAsOf={currentCutoffs,comparisonCutoffs,
    cutoffAlignment:currentCutoffs.length===1&&comparisonCutoffs.length===1?(currentCutoffs[0]===comparisonCutoffs[0]?'same':'different'):'unknown',
    note:'只记录页面显示的数据截止时点；时点相同也不代表归因、退款和统计范围完全一致。'};
  // Only compare the two local mode tabs, never a page-wide active ancestor.
  const modeNames=['稳定成本推广','全店托管'];
  const modeEvidence=[];
  const modeTokens=tokens.filter(t=>modeNames.includes(t.value));
  const explicitModes=new Set();
  for(const t of modeTokens){
    let e=t.e;
    for(let depth=0;e&&e!==document.body&&depth<4;depth++,e=e.parentElement){
      if(modeNames.some(name=>name!==t.value&&scopedText(e).includes(name)))break;
      const classes=String(e.className||'').split(/\s+/);
      if(e.getAttribute('aria-selected')==='true'||e.getAttribute('data-state')==='active'||classes.some(c=>/(?:^|[-_])(active|selected|current)(?:$|[-_])/i.test(c))){
        explicitModes.add(t.value);modeEvidence.push({mode:t.value,source:'explicit-tab-state'});break;
      }
    }
  }
  const visualModes=new Set();
  if(!explicitModes.size){
    for(const a of modeTokens)for(const b of modeTokens){
      if(a.value===b.value)continue;
      let group=a.e;for(let i=0;group&&i<5&&!group.contains(b.e);i++)group=group.parentElement;
      if(!group||group===document.body||!group.contains(b.e)||scopedText(group).replace(/\s/g,'').length>100)continue;
      const ar=a.e.getBoundingClientRect(),br=b.e.getBoundingClientRect();
      if(Math.abs(ar.top-br.top)>30||Math.abs(ar.left-br.left)>500)continue;
      const sa=getComputedStyle(a.e),sb=getComputedStyle(b.e);
      const weight=s=>s.fontWeight==='bold'?700:Number(s.fontWeight)||400;
      const saturation=s=>{const rgb=s.color.match(/[\d.]+/g)?.slice(0,3).map(Number);return rgb?.length===3?(Math.max(...rgb)-Math.min(...rgb))/255:0;};
      if(weight(sa)>=600&&weight(sa)-weight(sb)>=100){visualModes.add(a.value);modeEvidence.push({mode:a.value,source:'paired-tab-font-weight',weights:[weight(sa),weight(sb)]});}
      if(saturation(sa)>.25&&saturation(sa)-saturation(sb)>.15){visualModes.add(a.value);modeEvidence.push({mode:a.value,source:'paired-tab-color',colors:[sa.color,sb.color]});}
    }
  }
  const selectedModes=[...(explicitModes.size?explicitModes:visualModes)].sort();
  const managedMode=selectedModes.length===1&&selectedModes[0]==='全店托管';
  const products=[],pendingRows=[],seenRows=new Set();
  const idPattern=/商品\s*ID\s*[:：]\s*(\d{6,20})(?!\d)/gi;
  const rowFieldLabels=managedMode?['交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量']:['成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数','每笔净成交花费(元)','曝光量','点击量'];
  const numeric=value=>{
    const match=/^[¥￥]?(-?\d[\d,]*(?:\.\d+)?)(?:\s*(万|亿))?(?:\s*(%))?(?:\s|元|$)/.exec(value.trim());
    return match?match[1]+(match[2]||'')+(match[3]||''):null;
  };
  // Some merchant tables render headers and rows in separate wrappers.
  // Accept only a clean header band with multiple known labels and no numeric data.
  const headerName=value=>rowFieldLabels.find(l=>normalize(l)===normalize(value).replace(/[↑↓↕▲▼⇅]/g,''));
  const headerNodes=[];
  for(const token of tokens){
    let e=token.e;
    for(let depth=0;e&&e!==document.body&&depth<4;depth++,e=e.parentElement){
      const label=headerName(scopedText(e));
      if(label){if(!headerNodes.some(h=>h.e===e))headerNodes.push({e,label});break;}
      if(scopedText(e).length>80)break;
    }
  }
  const headerGroups=[];
  for(const h of headerNodes){
    let group=h.e.parentElement;
    for(let depth=0;group&&group!==document.body&&depth<6;depth++,group=group.parentElement){
      const members=headerNodes.filter(x=>group.contains(x.e));
      if(new Set(members.map(x=>x.label)).size<2)continue;
      const groupText=scopedText(group);
      if(groupText.length>2000||/商品\s*ID\s*[:：]/i.test(groupText)||tokens.some(t=>group.contains(t.e)&&/^[¥￥]?\d/.test(t.value)))break;
      if(!headerGroups.some(g=>g.e===group)){
        const headers=members.map(m=>{
          let cell=m.e;
          while(cell.parentElement&&cell.parentElement!==group){
            const parent=cell.parentElement;
            if(headerNodes.some(other=>other.label!==m.label&&parent.contains(other.e)))break;
            cell=parent;
          }
          const rect=cell.getBoundingClientRect();return {label:m.label,left:rect.left,right:rect.right,bottom:rect.bottom};
        });
        headerGroups.push({e:group,scroller:horizontalScroller(group),headers,bottom:Math.max(...headers.map(x=>x.bottom))});
      }break;
    }
  }
  for(const {e,value} of tokens){
    if(!/商品\s*ID\s*[:：]/i.test(value))continue;
    let row=e.closest(rowSelector);
    if(!row){
      let parent=e;
      for(let depth=0;parent&&parent!==document.body&&depth<8;depth++,parent=parent.parentElement){
        const candidate=scopedText(parent);
        if(candidate.length>3000)break;
        if([...candidate.matchAll(idPattern)].length===1&&/预算日限额|净目标投产比/.test(candidate)){row=parent;break;}
      }
    }
    if(!row){pendingRows.push({reason:'发现商品ID标记，但未识别唯一行边界'});continue;}
    if(seenRows.has(row))continue;seenRows.add(row);
    const rowText=scopedText(row),ids=[...rowText.matchAll(idPattern)].map(m=>m[1]);
    if(ids.length!==1){pendingRows.push({reason:'行内商品ID不唯一，未绑定指标'});continue;}
    const productId=ids[0];
    const budgetMatch=/预算日限额\s*(?:[（(]元[）)])?\s*[:：]?\s*(不限|\d[\d,]*(?:\.\d+)?)/.exec(rowText);
    const roasMatch=/净目标投产比\s*[:：]?\s*(\d+(?:\.\d+)?)/.exec(rowText);
    const budget=budgetMatch?{kind:budgetMatch[1]==='不限'?'unlimited':'amount',display:budgetMatch[1],currency:'CNY'}:null;
    const targetNetRoas=roasMatch?roasMatch[1]:null;
    const statusMatch=/(?:^|\s)(推广中|手动暂停|已暂停|已结束|推广受限)(?:\s|$)/.exec(rowText);
    const exhausted=/到达日限额|达到日限额|已达日限额|日限额已达/.test(rowText);
    const status=exhausted?'到达日限额':statusMatch?statusMatch[1]:null;
    const statusReason=exhausted?'daily-budget-exhausted':status==='手动暂停'?'manual-paused':status==='推广中'?'promoting':null;
    const budgetWarning=/预算不足/.test(rowText)?'预算不足':/预算较低/.test(rowText)?'预算较低':null;
    const fields=[];
    const table=row.closest('table,[role="table"],[role="grid"]');
    let mapping='unavailable';
    let hasOwnHeaders=false;
    let allowGeometry=!table;
    if(table){
      const headers=[...table.querySelectorAll('thead tr:last-child th,[role="columnheader"]')];
      hasOwnHeaders=headers.length>0;
      const cells=[...row.children].filter(c=>['TD','TH'].includes(c.tagName)||c.getAttribute('role')==='cell'||c.getAttribute('role')==='gridcell');
      allowGeometry=!headers.length||headers.length>=cells.length;
      if(headers.length&&headers.length===cells.length&&headers.every(h=>(h.colSpan||1)===1&&(h.rowSpan||1)===1)){
        mapping='visible-column-headers';
        headers.forEach((header,i)=>{
          if(!visible(header)||!visible(cells[i]))return;
          const label=headerName(scopedText(header));if(!label)return;
          const value=numeric(scopedText(cells[i]));if(value!==null&&validMetric(label,value))fields.push({label,current:value});
        });
      }
    }
    if(!fields.length&&allowGeometry){
      const rowRect=row.getBoundingClientRect();
      const bodyScroller=horizontalScroller(row);
      const groups=headerGroups.filter(g=>{const h=g.scroller;const compatible=h===bodyScroller||Math.abs((h?.scrollLeft||0)-(bodyScroller?.scrollLeft||0))<2;if(!compatible&&rejectedMappings.length<30)rejectedMappings.push({productId,reason:'header-body-horizontal-offset-mismatch',headerOffset:h?.scrollLeft||0,bodyOffset:bodyScroller?.scrollLeft||0});return compatible;}).filter(g=>g.bottom<=rowRect.top+3&&g.headers.some(h=>h.right>rowRect.left&&h.left<rowRect.right)).sort((a,b)=>b.bottom-a.bottom);
      if(groups.length){
        const group=groups[0];
        for(const header of group.headers){
          const candidates=[];
          for(const token of tokens){
            if(!row.contains(token.e))continue;let current=numeric(token.value);if(current===null)continue;
            const rect=token.e.getBoundingClientRect(),center=(rect.left+rect.right)/2;
            if(center<header.left-1||center>header.right+1||rect.top<rowRect.top-1||rect.bottom>rowRect.bottom+1)continue;
            const parentText=token.e.parentElement?scopedText(token.e.parentElement):'';
            if(/^[¥￥]?\d[\d,]*(?:\.\d+)?\s*(?:万|亿|%)$/.test(parentText.trim()))current=numeric(parentText);
            if(!candidates.some(c=>c.current===current&&Math.abs(c.top-rect.top)<2))candidates.push({current,top:rect.top});
          }
          if(candidates.length===1&&!validMetric(header.label,candidates[0].current)){if(rejectedMappings.length<30)rejectedMappings.push({productId,label:header.label,reason:'incompatible-metric-unit'});continue;}
          if(candidates.length===1&&!fields.some(f=>f.label===header.label))fields.push({label:header.label,current:candidates[0].current});
        }
        if(fields.length)mapping='separate-header-column-alignment';
      }
    }
    products.push({productId,status,statusReason,budgetWarning,budget,targetNetRoas,metrics:fields,
      mapping,top:Math.round(row.getBoundingClientRect().top),verification:'pending',
      missingFields:[...(!managedMode&&!budget?['预算日限额']:[]),...(!managedMode&&!targetNetRoas?['净目标投产比']:[]),...rowFieldLabels.filter(l=>!fields.some(f=>f.label===l))]});
    if(products.length>=50)break;
  }
  const duplicateIds=products.filter((p,i)=>products.findIndex(x=>x.productId===p.productId)!==i).map(p=>p.productId);
  const warnings=['识别到推广页面不等于已验证店铺身份。','采集值仅供人工核对，不自动加入利润计算或形成调价指令。','同名指标可能来自不同区域；日期可能包含对比日期，均不可自动合并。'];
  if(dataAsOf.cutoffAlignment==='different')warnings.push('当前日与对比日截止时点不同，禁止直接按汇总值做同比判断。');
  if(duplicateIds.length)warnings.push('检测到重复商品ID，不自动合并重复行。');
  const listedCounts=[...new Set([...compactText.matchAll(/合计数据[（(](\d+)条[）)]/g)].map(m=>Number(m[1])))];
  const summaryMetrics=metrics.filter(m=>![...seenRows].some(row=>row.contains(metricElements.get(m))));
  const managedData=tokens.find(t=>t.value==='托管数据');
  const settingsToken=tokens.find(t=>t.value==='托管设置');
  const settingsTop=settingsToken?.e.getBoundingClientRect().top;
  const managedTop=managedData?.e.getBoundingClientRect().top;
  for(const m of summaryMetrics)m.scope=managedMode?(managedTop!==undefined&&m.top>=managedTop?'managed-summary':settingsTop!==undefined&&m.top>=settingsTop?'managed-settings':'overall-summary'):'overall-summary';
  const settingValue=(label,pattern)=>{
    const t=tokens.find(t=>normalize(t.value)===label);if(!t)return null;
    let e=t.e;for(let i=0;e&&e!==document.body&&i<4;i++,e=e.parentElement){
      const text=scopedText(e);if(text.length>180)break;
      const match=pattern.exec(text);if(match)return match[1];
    }return null;
  };
  const totalBudget=managedMode?settingValue('总预算日限额',/总预算日限额\s*[:：]?\s*(不限|\d[\d,]*(?:\.\d+)?)/):null;
  const totalTarget=managedMode?settingValue('总净目标投产比',/总净目标投产比\s*[:：]?\s*(\d+(?:\.\d+)?)/):null;
  const managedSettings=managedMode?{budget:totalBudget?{kind:totalBudget==='不限'?'unlimited':'amount',display:totalBudget,currency:'CNY'}:null,targetNetRoas:totalTarget,scope:'managed-global'}:null;

  const controls=[];
  const addFilter=(label,value,source)=>{value=String(value||'').replace(/\s/g,'').slice(0,100);if(label!=='商品搜索')value=value.replace(/[?？↕↑↓⌄▾▼]/g,'');if(!controls.some(c=>c.label===label&&c.value===value))controls.push({label,value,source});};
  for(const e of document.querySelectorAll('select'))if(visible(e)){
    const context=[e.name,e.getAttribute('aria-label'),e.parentElement?.innerText].filter(Boolean).join(' ');
    const label=/推广状态|promotion.?status/i.test(context)?'推广状态':/推广阶段|promotion.?stage/i.test(context)?'推广阶段':/分组|group/i.test(context)?'分组':null;
    if(label)addFilter(label,e.value,'select');
  }
  for(const input of document.querySelectorAll('input'))if(visible(input)&&/商品|推广名称/i.test(input.placeholder||'')&&input.type!=='password')addFilter('商品搜索',input.value,'search');
  for(const t of tokens)if(/^(推广状态|推广阶段|分组)\s*[:：]?$/.test(t.value)){
    const label=t.value.replace(/[\s:：]/g,'');const hint=t.e.parentElement?scopedText(t.e.parentElement).replace(/\s/g,''):'';
    if(hint.length<80&&!controls.some(c=>c.label===label)){
      const value=hint.replace(new RegExp('^'+label+'[:：]?'),'');if(value)addFilter(label,value,'visible-label');
    }
  }
  controls.sort((a,b)=>(a.label+'='+a.value).localeCompare(b.label+'='+b.value));
  const filterEvidence={controls,labels:[...new Set(controls.map(c=>c.label))],version:2};
  const filterSignals=controls.map(c=>c.label+'='+c.value);
  const scopeText=JSON.stringify({modes:selectedModes,filters:filterSignals.sort()});let scopeHash=2166136261;
  for(let i=0;i<scopeText.length;i++){scopeHash^=scopeText.charCodeAt(i);scopeHash=Math.imul(scopeHash,16777619);}
  return {schemaVersion:'0.9.1',origin:location.origin,recognized:true,metrics:summaryMetrics.slice(0,100),dateCandidates:dateCandidates.slice(0,6),selectedDateRange:selectedDates,dateScopes,dataAsOf,
    filterEvidence,managedSettings,modeEvidence,activeMode:selectedModes.length===1?selectedModes[0]:null,scopeFingerprint:(scopeHash>>>0).toString(16),
    diagnostics:{rejectedMappings,headerBandCount:headerGroups.length,headerLabels:[...new Set(headerGroups.flatMap(g=>g.headers.map(h=>h.label)))],unmappedProductRows:products.filter(p=>!p.metrics.length).length},
    products,pendingRows,duplicateIds,listedCount:listedCounts.length===1?listedCounts[0]:null,renderedOffscreenIncluded:Boolean(options.includeOffscreen),productScope:'仅本次可见行与可见列；不包含未滚动到的行、隐藏列或其他分页。',
    scope:options.includeOffscreen?'当前页面已渲染区域，含屏幕外但不含隐藏内容；未切换日期':'当前窗口可见区域；未滚动、未切换日期、未点击按钮',loginVerified:false,
    warnings};
}
