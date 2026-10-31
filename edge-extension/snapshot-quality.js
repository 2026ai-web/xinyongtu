// Structural acceptance only. It does not verify shop identity or authorize ad changes.
export function assessSnapshot(data){
 if(data?.source==='daily-edge-sidebar-refresh-failed')return {accepted:false,problems:['刷新阶段未开始扫描：'+(data.refreshEvidence?.error||'页面未就绪')],details:[],warnings:[],summaryChecks:[],meaning:'刷新未完成，尚未开始商品与汇总验收。'};
 const problems=[],details=[],warnings=[],a=data?.autoCollection,rows=data?.products||[];
 const managed=data?.activeMode==='全店托管';
 const fields=managed?['交易额(元)','净交易额(元)','净成交笔数','曝光量','点击量']:['成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数','每笔净成交花费(元)','曝光量','点击量'];
 if(data?.refreshEvidence?.error)problems.push('刷新校验失败：'+data.refreshEvidence.error);
 if(!a)problems.push('不是完整自动扫描结果');
 if(!a?.scanCompleted)problems.push('扫描没有正常完成');
 if(!a?.rowCoverageConfirmed||!Number.isInteger(a?.expectedRows)||rows.length!==a.expectedRows)problems.push('商品行数覆盖未确认');
 if(new Set(rows.map(r=>r.productId)).size!==rows.length)problems.push('存在重复商品ID');
 if(data?.conflictProductIds?.length||data?.conflictRecords?.length)problems.push('存在未解决的采集冲突');
 if(!a?.dateRangeVerified||!data?.dateScopes?.primaryVerified)problems.push('推广统计日期未可靠识别');
 if(!['稳定成本推广','全店托管'].includes(data?.activeMode))problems.push('推广模式未可靠识别');
 if(!a?.fieldsComplete||!rows.length||rows.some(r=>r.missingFields.length))problems.push('存在缺失字段');
 if(rows.some(r=>!r.singleObservationComplete))problems.push('缺少单次完整行观测');
 for(const r of rows){
  const issue=(field,reason)=>details.push({productId:r.productId,field,reason});
  if(!/^\d{6,20}$/.test(r.productId))issue('商品ID','格式错误');
  if(!r.status)warnings.push('商品 '+r.productId+'：推广状态未识别，仅供只读指标分析，不据此判断投放状态。');
  if(!managed){if(!r.budget)issue('预算日限额','未识别');if(!/^\d+(?:\.\d+)?$/.test(r.targetNetRoas||''))issue('净目标投产比','格式错误或未识别');}
  for(const label of fields){const values=r.metrics?.filter(m=>m.label===label)||[];
   const pattern=/曝光量|点击量|成交笔数|元|交易额|花费/.test(label)?/^\d[\d,]*(?:\.\d+)?(?:万|亿)?$/:/^-?\d[\d,]*(?:\.\d+)?$/;
   if(values.length!==1)issue(label,values.length?'存在重复候选':'字段缺失');else if(!pattern.test(values[0].current))issue(label,'数值格式或单位错误');
  }
 }
 if(details.length)problems.push('商品字段检查失败：'+details.slice(0,4).map(d=>d.productId+' / '+d.field+' / '+d.reason).join('；')+(details.length>4?'；其余见导出诊断':''));
 if(managed&&(!data.managedSettings?.budget||!/^\d+(?:\.\d+)?$/.test(data.managedSettings?.targetNetRoas||'')))problems.push('托管总预算或总目标投产比未识别');
 const summaryChecks=[];
 const summaryFields=['成交花费(元)','交易额(元)','实际投产比','总花费(元)','净交易额(元)','净实际投产比','净成交笔数'];
 for(const scope of managed?['overall-summary','managed-summary']:['overall-summary'])for(const label of summaryFields){
  const values=(data.metrics||[]).filter(m=>m.scope===scope&&m.label===label);
  const pattern=/元|成交笔数/.test(label)?/^\d[\d,]*(?:\.\d+)?(?:万|亿)?$/:/^\d[\d,]*(?:\.\d+)?$/;
  const reason=values.length!==1?(values.length?'重复候选':'缺失'):!pattern.test(values[0].current)?'格式或单位错误':null;
  summaryChecks.push({scope,label,accepted:!reason,reason});
  if(reason)problems.push((scope==='overall-summary'?'整体汇总':'托管汇总')+' / '+label+' / '+reason);
  else if(/元/.test(label)&&/[万亿]$/.test(values[0].current))warnings.push((scope==='overall-summary'?'整体汇总':'托管汇总')+' '+label+' 为页面缩写值 '+values[0].current+'，不能当作精确到分的金额。');
 }

 if(data?.pendingRows?.length)problems.push('存在未解析商品行');
 return {accepted:problems.length===0,problems,details,warnings,summaryChecks,meaning:'仅结构检查合格，尚未验证店铺身份、最终结算或利润。'};
}
export function createSnapshotJournal(){
 const qualified=new Map();let latest=null;
 const key=(data,session)=>JSON.stringify({session,origin:data.origin||'',dates:data.selectedDateRange||[],filter:data.scopeFingerprint||'',mode:data.activeMode||'unknown'});
 return {
  record(data,session){
   const assessment=assessSnapshot(data),scope=key(data,session);latest={...structuredClone(data),qualityAssessment:assessment};
   if(assessment.accepted){qualified.set(scope,structuredClone(latest));if(qualified.size>10)qualified.delete(qualified.keys().next().value);}
   return {assessment,latestAttempt:latest,lastQualified:qualified.get(scope)||null,promoted:assessment.accepted};
  },
  clear(){qualified.clear();latest=null;},
 };
}
