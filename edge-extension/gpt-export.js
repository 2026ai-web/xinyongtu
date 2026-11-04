import {datasetKey,metricFields,metricNumber,validateHours,validateOverall,reconcileProduct,recordingGuide} from './batch-model.js';

// Pure local projection. No network, model call, database mutation or arithmetic
// allocation. Only datasets referenced by the persisted task are included.
export function createGptExport(warehouse,job,{extensionVersion='unknown',exportedAt=new Date().toISOString()}={}){
 if(!job||job.shop!==warehouse.shop)throw Error('本店尚无可导出的采集任务');
 const dates=job.dates;if(!Array.isArray(dates)||!dates.length)throw Error('最近任务日期缺失');
 const issues=[],columns=[],columnSet=new Set(),index=new Map();
 for(const row of warehouse.datasets||[]){const key=datasetKey(row);if(index.has(key))throw Error('仓库存在重复数据键，未自动选择');index.set(key,row);}
 const references=new Set([...Object.values(job.completedDays||{}),...Object.values(job.units||{}).flatMap(u=>Object.values(u.completed||{}))]);
 const source=[];
 for(const key of references){const row=index.get(key);if(!row){issues.push('任务引用的数据缺失：'+key);continue;}if(row.shop!==job.shop||row.origin!=='https://yingxiao.pinduoduo.com'||!dates.includes(row.date)||!['account-day','unit-day'].includes(row.type)){issues.push('任务数据范围不符：'+key);continue;}source.push(row);}
 const groups=row=>[row.summary||[],...(row.hourly||[]).map(h=>h.metrics||[]),...(row.products||[]).map(p=>p.metrics||[]),row.dailyOverall?.metrics||[]];
 for(const row of source)for(const metrics of groups(row))for(const m of metrics)if(!columnSet.has(m.label)){columnSet.add(m.label);columns.push(m.label);}
 const cells=metrics=>{const map=new Map();for(const m of metrics||[]){if(map.has(m.label))throw Error('重复指标列：'+m.label);map.set(m.label,m);}const values=[],nonExact={};columns.forEach((label,i)=>{const m=map.get(label);values.push(m?.current??null);if(!m||m.state!=='exact')nonExact[i]=m?.state||'absent';});return {values,...(Object.keys(nonExact).length?{nonExact}:{})};};
 const hourly=rows=>{const values=[],nonExact={};for(const [i,row] of (rows||[]).entries()){const packed=cells(row.metrics);values.push(packed.values);if(packed.nonExact)nonExact[i]=packed.nonExact;}return {hours:(rows||[]).map(r=>r.hour),values,...(Object.keys(nonExact).length?{nonExact}:{})};};
 const accounts=new Map(source.filter(r=>r.type==='account-day').map(r=>[r.date,r]));
 const settings=p=>structuredClone(p?.settings||{targetRoas:{value:null,state:p?.mode==='全店托管'?'managed-shared-not-collected':'not-collected',historicalSettingVerified:false}});
 const records=source.map(row=>{
  const errors=[];let validation;
  try{
   if(!row.context?.primaryVerified||row.context.dates?.length!==1||row.context.dates[0]!==row.date)throw Error('页面日期未确认单日');
   validation=validateHours(row.hourly||[],row.mode);
   if(row.type==='account-day'){
    validateOverall(row.summary,validation.totals);
    if(!row.summarySources?.length||!row.summarySources.every(s=>s.source==='overview-table-total'))throw Error('整体数据不是概况表格合计');
   }else{
    if(row.context.beginDate!==row.date||row.context.endDate!==row.date||row.context.productId!==row.productId||row.context.adId!==row.adId)throw Error('详情日期或身份不符');
    const matches=accounts.get(row.date)?.products?.filter(p=>p.productId===row.productId&&p.mode===row.mode)||[];
    if(matches.length!==1)throw Error('缺少唯一的账户商品日汇总');
    for(const label of metricFields){const value=metricNumber(label,matches[0].metrics.find(m=>m.label===label));if(value===null&&!(row.mode==='全店托管'&&label==='总花费(元)'))throw Error('日汇总字段不可为空：'+label);if(metricNumber(label,row.dailyOverall?.metrics?.find(m=>m.label===label))!==value)throw Error('保存的链接日汇总与账户商品行不符：'+label);}
    if(!reconcileProduct(matches[0],validation.totals).matched)throw Error('链接日汇总与小时数据不一致');
   }
  }catch(e){errors.push(e.message);}
  return {scope:row.type==='account-day'?'account':'promotion-link',date:row.date,mode:row.mode,productId:row.productId||null,adId:row.adId||null,capturedAt:row.capturedAt,
   summary:cells(row.summary),hourly:hourly(row.hourly),
   ...(row.type==='account-day'?{summarySources:structuredClone(row.summarySources||[]),links:(row.products||[]).map(p=>({productId:p.productId,mode:p.mode,adId:p.adId||null,settings:settings(p),...cells(p.metrics)})),managedShared:structuredClone(row.managedShared||null)}:{settings:settings(row.dailyOverall||row),dailyOverall:row.dailyOverall?cells(row.dailyOverall.metrics):null,sharedManagedGroupRef:row.sharedManagedGroupRef||null}),
   fieldAvailability:structuredClone(row.fieldAvailability||{}),checks:{valid:!errors.length,errors,financialComplete:validation?.financialComplete??false}};
 });
 const coverage=dates.map(date=>{const a=records.filter(r=>r.date===date&&r.scope==='account'),links=records.filter(r=>r.date===date&&r.scope==='promotion-link'),expected=a[0]?.links||[];const counts=expected.map(p=>links.filter(r=>r.productId===p.productId&&r.mode===p.mode).length);return {date,accountDays:a.length,expectedLinkDays:a.length===1?expected.length:null,linkDays:links.length,linkHours:links.reduce((n,r)=>n+r.hourly.hours.length,0),complete:a.length===1&&a[0].checks.valid&&counts.every(n=>n===1)&&links.length===expected.length&&links.every(r=>r.checks.valid)};});
 const settingRows=records.filter(r=>r.scope==='account').flatMap(r=>r.links).filter(p=>p.mode==='稳定成本推广');const settingsCoverage={stableLinkDays:settingRows.length,observedTargetDays:settingRows.filter(p=>p.settings.targetRoas.state==='observed').length,complete:settingRows.length>0&&settingRows.every(p=>p.settings.targetRoas.state==='observed'),historicalSettingVerified:false};
 const complete=job.phase==='complete'&&!issues.length&&coverage.every(c=>c.complete);
 return {schemaVersion:'xinyongtu-gpt-export-1',exportedAt,extensionVersion,shopNote:warehouse.shop,shopIdentityVerified:false,
  settingsCoverage,task:{id:job.id,dates,phase:job.phase,complete,coverage,issues,failures:(job.failures||[]).map(f=>({date:f.date,productId:f.productId,mode:f.mode,message:f.message}))},
  guide:{...recordingGuide,targetRoas:'settings.targetRoas为同商品同模式行内设置观察，与实际投产比指标分开；observedAt是观察时间，snapshotDate仅报表统计日，historicalSettingVerified=false表示未经历史设置验证。切历史日期不证明目标值当日生效，缺失不补零、不沿用别日；settingsCoverage独立于原三层数据完整性。目标投产与后台实际投产、订单实收保本投产不是同一指标，不直接互填。托管共享目标本轮不按链接推断。',currentTask:'records仅包含task所引用的已保存记录；task.complete和coverage表示本次核对状态。',selection:'仅最近保存任务的完成引用；不混入其它历史任务。未完成任务明确标记，不补零。',metricEncoding:'metricColumns为列顺序；values保留页面原字符串，金额单位元。默认状态exact；nonExact以从0开始的列号记录例外。hourly.nonExact先以从0开始的行号再以列号索引，hours为对应小时。absent表示该记录没有此列，不等于平台明确not-provided。',sharedSpend:'managedShared.spend.amountFen单位分，是差额推导；不与账户总额重复相加，不分摊到链接。',dataStatus:'这是本机采集快照，不代表利润、结算或平台当前值。capturedAt是采集时间，date是统计日。'},
  metricColumns:columns,records};
}
