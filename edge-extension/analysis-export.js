import {createGptExport} from './gpt-export.js';
import {datasetKey} from './batch-model.js';
import {productAccounting} from './product-accounting.js';
import {dateFromOrderId,ORDER_POLICY,orderDisposition} from './cost-model.js';
import {canonical} from './backup-model.js';
const validDay=s=>/^20\d{2}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function auditReport(report,versions){
 const errors=[],sum={totalOrders:report.details?.length||0,includedOrders:0,excludedOrders:0,pendingOrders:0,quantity:0,revenueFen:0,skuCostFen:0};
 try{
  if(report.accountingPolicy!==undefined&&report.accountingPolicy!==ORDER_POLICY)throw Error('未知核算规则版本');
  if(!Number.isFinite(Date.parse(report.createdAt))||report.schemaVersion!=='order-cost-accounting-1'||!['user-confirmed-order-day','order-id-prefix'].includes(report.dateSource)||!report.complete||report.issues?.length)throw Error('核算记录未完整或订单日期未经确认');
  const candidates=versions.filter(v=>v.id===report.costVersion?.id);if(candidates.length!==1)throw Error('本机缺少唯一的核算成本版本');const v=candidates[0];if(v.effectiveFrom!==report.costVersion.effectiveFrom||v.effectiveFrom>report.date)throw Error('成本适用日期不符');
  const seen=new Set();for(const row of report.details){if(!row.orderId||seen.has(row.orderId))throw Error('核算订单为空或重复');seen.add(row.orderId);if(report.dateSource==='order-id-prefix'&&dateFromOrderId(row.orderId)!==report.date)throw Error('订单号日期与核算日不一致');
   if(row.included){if(!(report.accountingPolicy===ORDER_POLICY?orderDisposition(row.status,row.afterSale)==='include':['已发货，待收货','已收货'].includes(row.status)&&row.afterSale==='无售后或售后取消'))throw Error('纳入订单状态不符合已确认口径');if(row.orderKind==='supplement'){if(report.accountingPolicy!==ORDER_POLICY||row.sku!==''||row.quantity!==0||row.unitFullCostFen!==0||row.skuCostFen!==0||!integer(row.sourceQuantity)||!row.sourceQuantity||row.sourceQuantity>1000000||!integer(row.revenueFen))throw Error('补差价规则、数量或成本不符');}else{if(!row.sku||!integer(row.quantity)||!row.quantity||!integer(row.revenueFen)||!integer(row.unitFullCostFen)||!integer(row.skuCostFen)||row.unitFullCostFen*row.quantity!==row.skuCostFen)throw Error('逐单成本或数量不符');const c=Object.hasOwn(v.costs.map,row.sku)?v.costs.map[row.sku]:null;if(!c||c.values.length!==1||c.values[0]!==row.unitFullCostFen)throw Error('逐单成本与所用SKU成本版本不符');}sum.includedOrders++;sum.quantity+=row.quantity;sum.revenueFen+=row.revenueFen;sum.skuCostFen+=row.skuCostFen;
   }else if(row.reason==='取消/退款/售后处理中，收入与成本均剔除'){if(!(/取消|退款/.test(row.status)||['退款成功','售后处理中'].includes(row.afterSale)))throw Error('剔除订单状态不符');sum.excludedOrders++;}else if(row.reason==='待付款，收入与成本均剔除'){if(report.accountingPolicy!==ORDER_POLICY||orderDisposition(row.status,row.afterSale)!=='unpaid')throw Error('待付款剔除状态不符');sum.excludedOrders++;}else sum.pendingOrders++;
  }
  for(const [key,n] of Object.entries(sum))if(!Number.isSafeInteger(n)||report.summary[key]!==n)throw Error('核算合计不符：'+key);
  if(report.accountingPolicy===ORDER_POLICY){const supplements=report.details.filter(r=>r.included&&r.orderKind==='supplement');if(report.summary.supplementOrders!==supplements.length||report.summary.supplementRevenueFen!==supplements.reduce((n,r)=>n+r.revenueFen,0))throw Error('补差价汇总不符');}
  if(sum.revenueFen>1e12)throw Error('核算收入超出原有精确范围');const fee=Math.floor((sum.revenueFen*35+500)/1000);if(report.summary.platformFeeFen!==fee||report.summary.beforeAdBalanceFen!==sum.revenueFen-sum.skuCostFen-fee||!integer(report.summary.adSpendFen)||report.summary.balanceFen!==sum.revenueFen-sum.skuCostFen-fee-report.summary.adSpendFen||sum.pendingOrders)throw Error('手续费/经营结余或待确认订单不符');
  if(report.adEvidence?.date!==report.date||report.adEvidence?.scope!=='account'||report.adEvidence?.source!=='overview-table-total')throw Error('核算缺少同日账户广告来源');
 }catch(e){errors.push(e.message);}
 return {valid:!errors.length,errors};
}
export function createAnalysisExport({shop,dates,warehouse,reports,costVersions,extensionVersion='unknown',exportedAt=new Date().toISOString()}){
 if(!shop||warehouse.shop!==shop)throw Error('请选择同一店铺的数据');if(!Array.isArray(dates)||!dates.length||dates.length>30||!dates.every(validDay)||new Set(dates).size!==dates.length)throw Error('分析日期无效');dates=[...dates].sort();
 // Encode saved snapshots without fabricating a completed collection task.
 const selector={id:'saved-date-selection',shop,dates,phase:'snapshot-selection',completedDays:{},units:{}};const selected=(warehouse.datasets||[]).filter(r=>r.shop===shop&&dates.includes(r.date));
 for(const r of selected){const key=datasetKey(r);if(r.type==='account-day'){if(selector.completedDays[r.date])throw Error('同日存在多个账户快照，未自动选择');selector.completedDays[r.date]=key;}else if(r.type==='unit-day')selector.units[key]={completed:{[r.date]:key}};}
 const encoded=createGptExport({...warehouse,datasets:selected},selector,{extensionVersion,exportedAt});
 const days=dates.map(date=>{
  const promo=encoded.task.coverage.find(c=>c.date===date),account=selected.find(r=>r.type==='account-day'&&r.date===date),candidates=reports.filter(r=>r.shopNote===shop&&r.date===date).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const reasons=[];let accounting=null,matched=false;
  if(!promo?.complete)reasons.push('该日推广数据缺失或未通过完整性核对');
  if(!candidates.length)reasons.push('该日尚无订单核算记录');else{
   const latest=candidates[0],withoutId=r=>{const copy=structuredClone(r);delete copy.id;return canonical(copy);};const tied=candidates.filter(r=>r.createdAt===latest.createdAt);const ambiguous=new Set(tied.map(withoutId)).size>1;
   const checks=ambiguous?{valid:false,errors:['同一核算时间有不同内容，未自动选择']}:auditReport(latest,costVersions);
   if(!checks.valid)reasons.push(...checks.errors);
   const sameSpend=account&&account.summary?.find(m=>m.label==='总花费(元)')&&encoded.records.find(r=>r.scope==='account'&&r.date===date)?.checks.valid;
   const spendColumn=encoded.metricColumns.indexOf('总花费(元)'),observed=encoded.records.find(r=>r.scope==='account'&&r.date===date)?.summary.values[spendColumn];
   const currentFen=typeof observed==='string'&&/^\d[\d,]*(?:\.\d+)?$/.test(observed)?Math.round(Number(observed.replace(/,/g,''))*100):null;
   const sameSnapshot=!!sameSpend&&Number.isFinite(Date.parse(latest.adEvidence?.capturedAt))&&latest.summary?.adSpendFen===currentFen&&latest.adEvidence?.capturedAt===account.capturedAt;
   if(checks.valid&&!sameSnapshot)reasons.push('订单核算引用的广告快照与本次推广快照不一致，请重新核算该日订单');
   matched=checks.valid&&sameSnapshot&&!!promo?.complete;
   const product=checks.valid?productAccounting(latest,sameSnapshot?account:null):null;
   if(product&&!product.complete)reasons.push(...product.issues,'商品分组或广告费用核对未完整');
   accounting={accountingPolicy:latest.accountingPolicy||'legacy-sku-orders',reportId:latest.id||null,createdAt:latest.createdAt,costVersion:structuredClone(latest.costVersion),checks,summary:checks.valid?structuredClone(latest.summary):null,adEvidence:checks.valid?structuredClone(latest.adEvidence):null,productAccounting:product,rules:checks.valid?structuredClone(latest.rules):null};
  }
  return {date,promotionComplete:!!promo?.complete,accountingPresent:!!candidates.length,accountingValid:!!accounting?.checks.valid,snapshotsMatched:matched,complete:matched&&!!accounting?.productAccounting?.complete,reasons:[...new Set(reasons)],accounting};
 });
 return {schemaVersion:'xinyongtu-gpt-analysis-1',extensionVersion,exportedAt,shopNote:shop,shopIdentityVerified:false,dates,complete:days.every(d=>d.complete),coverage:days.map(({accounting,...d})=>d),
  guide:{targetRoas:encoded.guide.targetRoas,purpose:'本机数据资料，供人工交给GPT分析；不是模型结论或店铺操作指令。',money:'promotion.values金额保留原字符串元；accounting.summary及productAccounting金额为整数分。',ordersScope:'经营结果只覆盖导入订单；自动识别订单日期不认证店铺身份或全天导出完整性，不能把部分订单当已核实全天。',accounting:'按商品ID跨推广模式汇总订单一次；剔除取消/退款成功/售后处理中收入及成本；非空SKU整套成本乘购买件数；新口径空SKU补差价计收入、0商品成本/件数，已付款待发货纳入、待付款剔除；实收合计扣3.5%及全部账户推广费。不是包含全部损益的最终净利润。',missing:'缺记录不补零，失败/快照不一致先说明，不能拼接成已核实盈亏。fieldAvailability保留原采集状态；unknown不代表0，需结合实际值、来源及checks说明，不能擅自改值。',shared:'托管共享费用不分摊，不能与账户花费重复相加。相关商品广告后结余和订单实收投产无法确定，不用零替代。',roas:'后台归因投产保留在promotion指标；订单实收投产为商品revenueFen/adSpendFen，两者口径不同，不混称。广告费为0显示—，共享费用不明时不计算完整投产。',time:'date为统计日，capturedAt/createdAt为不同采集/核算时刻，推广归因交易额不是订单实收，不能当同一批成交或相加；小时推广数据不代表逐小时订单利润。',unknown:'SKU成交明细、预算与目标投产、操作日志、最终结算及售后损益不能从本文件猜测。',privacy:'不包含订单号、逐单SKU明细或完整成本表；仅保留商品汇总、成本版本及推广数据。',analysisRequest:'先核对coverage和缺失说明，再分析整体/商品/时段变化；区分事实与假设，给出有依据的人工建议，不自动操作店铺。'},
  promotion:{settingsCoverage:encoded.settingsCoverage,source:'selected-dates-saved-snapshots',metricColumns:encoded.metricColumns,encoding:encoded.guide.metricEncoding,records:encoded.records},days};
}
