import {metricNumber,validateHours,validateOverall} from './batch-model.js';

// Orders belong to a product, not to an advertising mode. Never duplicate the
// same order across campaigns, or distribute shared managed advertising cost.
export function productAccounting(report,account=null){
 const groups=new Map(),issues=[];
 const group=id=>{if(!groups.has(id))groups.set(id,{productId:id,includedOrders:0,excludedOrders:0,pendingOrders:0,supplementOrders:0,supplementRevenueFen:0,quantity:0,revenueFen:0,skuCostFen:0,platformFeeFen:0,beforeAdBalanceFen:null,knownAdSpendFen:null,adSpendFen:null,afterAdBalanceFen:null,promotions:[],notes:[]});return groups.get(id);};
 for(const row of report.details){const id=/^\d{6,20}$/.test(row.productId||'')?row.productId:null,g=group(id);if(row.included){g.includedOrders++;if(row.orderKind==='supplement'){g.supplementOrders++;g.supplementRevenueFen+=row.revenueFen;}g.quantity+=row.quantity;g.revenueFen+=row.revenueFen;g.skuCostFen+=row.skuCostFen;}else if(['取消/退款/售后处理中，收入与成本均剔除','待付款，收入与成本均剔除'].includes(row.reason))g.excludedOrders++;else g.pendingOrders++;}
 // Largest remainder allocation of the already rounded whole-shop fee.
 // This is a bookkeeping allocation, not an observed platform per-product fee.
 let assigned=0;const ranked=[...groups.values()].map(g=>{const numerator=g.revenueFen*35;g.platformFeeFen=Math.floor(numerator/1000);assigned+=g.platformFeeFen;return {g,remainder:numerator%1000};}).sort((a,b)=>b.remainder-a.remainder||String(a.g.productId||'').localeCompare(String(b.g.productId||''),'en'));
 const extra=report.summary.platformFeeFen-assigned;if(extra<0||extra>ranked.length)throw Error('商品手续费与全店手续费无法核对');for(let i=0;i<extra;i++)ranked[i].g.platformFeeFen++;
 let accountValid=false,listComplete=false,knownSpend=0,unallocated=null;
 if(account){try{
  if(account.shop!==report.shopNote||account.date!==report.date||account.origin!=='https://yingxiao.pinduoduo.com'||account.mode!=='全部'||!account.context?.primaryVerified||account.context.dates?.length!==1||account.context.dates[0]!==report.date)throw Error('商品广告数据的店铺/日期/来源不符');
  validateOverall(account.summary,validateHours(account.hourly,'全部').totals);
  if(!account.summarySources?.length||!account.summarySources.every(s=>s.source==='overview-table-total'))throw Error('缺少账户表格合计证据');
  const total=metricNumber('总花费(元)',account.summary.find(m=>m.label==='总花费(元)'));if(total!==report.summary.adSpendFen)throw Error('商品广告快照与全店核算花费不符');
  if(!Array.isArray(account.products)||account.expectedRows!==account.products.length)throw Error('商品推广列表完整性未确认');
  const seen=new Set(),staged=[];for(const p of account.products){if(!/^\d{6,20}$/.test(p.productId)||!['稳定成本推广','全店托管'].includes(p.mode))throw Error('推广商品身份或模式不符');const identity=[p.productId,p.mode,p.adId||'unresolved'].join('|');if(seen.has(identity))throw Error('推广记录重复');seen.add(identity);
   const found=p.metrics.filter(m=>m.label==='总花费(元)');if(found.length!==1)throw Error('推广花费列缺失或重复');const amount=metricNumber('总花费(元)',found[0]);if(amount===null&&p.mode!=='全店托管')throw Error('非托管推广花费缺失');
   staged.push({productId:p.productId,promotion:{mode:p.mode,adId:p.adId||null,spendFen:amount,state:found[0].state,capturedAt:account.capturedAt}});if(amount!==null)knownSpend+=amount;
  }
  if(knownSpend>total)throw Error('已知链接推广花费超过账户总花费');unallocated=total-knownSpend;if(account.managedShared?.spend?.amountFen!==undefined&&account.managedShared.spend.amountFen!==unallocated)throw Error('托管共享记录与账户差额不一致');for(const p of staged)group(p.productId).promotions.push(p.promotion);listComplete=true;accountValid=true;
 }catch(error){issues.push(error.message);}}
 else issues.push('缺少同店铺同日账户商品推广明细');
 for(const g of groups.values()){
  if(g.productId===null)g.notes.push('订单商品ID缺失或无效，未猜测链接归属');if(g.pendingOrders)g.notes.push('存在待确认订单或SKU成本');
  if(g.productId!==null&&!g.pendingOrders)g.beforeAdBalanceFen=g.revenueFen-g.skuCostFen-g.platformFeeFen;
  if(!accountValid){g.adStatus='unavailable';g.notes.push('商品推广花费未完整核对');continue;}
  const shared=g.promotions.some(p=>p.mode==='全店托管'||p.spendFen===null),known=g.promotions.reduce((n,p)=>n+(p.spendFen??0),0);g.knownAdSpendFen=known;
  if(shared){g.adStatus='managed-shared';g.notes.push('参与托管共享费用，不分摊，广告后结余无法确定');}
  else if(unallocated>0&&!account.products.some(p=>p.mode==='全店托管'&&p.metrics.some(m=>m.label==='总花费(元)'&&m.state==='not-provided'))){g.adStatus='unallocated';g.notes.push('账户尚有未归属花费，不能确认完整单链接费用');}
  else if(g.productId===null){g.adStatus='unavailable';}
  else {g.adStatus=g.promotions.length?'known':'no-promotion-observed';g.adSpendFen=known;if(!g.promotions.length)g.notes.push('完整推广列表未见该商品，所选报表范围内广告费记0');if(g.beforeAdBalanceFen!==null)g.afterAdBalanceFen=g.beforeAdBalanceFen-known;}
 }
 const products=[...groups.values()].sort((a,b)=>String(a.productId||'').localeCompare(String(b.productId||''),'en'));
 const sum=field=>products.reduce((n,g)=>n+g[field],0),revenueMatches=sum('revenueFen')===report.summary.revenueFen,costMatches=sum('skuCostFen')===report.summary.skuCostFen,feeMatches=sum('platformFeeFen')===report.summary.platformFeeFen,ordersMatch=sum('includedOrders')===report.summary.includedOrders&&sum('excludedOrders')===report.summary.excludedOrders&&sum('pendingOrders')===report.summary.pendingOrders;
 const balance=accountValid&&!report.issues.length?sum('revenueFen')-sum('skuCostFen')-sum('platformFeeFen')-knownSpend-unallocated:null;
 return {schemaVersion:'product-accounting-1',scope:'product-all-promotion-modes',date:report.date,feeAllocation:{method:'largest-remainder-from-shop-fee',rate:'3.5%',rounding:'先全店合计四舍五入到分；各商品先向下取分，余分按小数余数降序补分，同余数按商品ID顺序。仅为账务分配，非平台逐商品扣费。'},complete:report.complete&&accountValid&&revenueMatches&&costMatches&&feeMatches&&ordersMatch&&!products.some(g=>g.productId===null||g.pendingOrders),issues,allProductBalancesKnown:products.every(g=>g.afterAdBalanceFen!==null),
  advertising:{listComplete,accountSpendFen:report.summary.adSpendFen,knownLinkSpendFen:accountValid?knownSpend:null,unallocatedSpendFen:unallocated,sharedManaged:accountValid?structuredClone(account.managedShared||null):null,allocationPolicy:'never-distribute-shared-cost',evidence:accountValid?{capturedAt:account.capturedAt,source:'account-day-product-rows'}:null},
  reconciliation:{revenueMatches,costMatches,feeMatches,ordersMatch,shopBalanceFromProductsFen:balance,shopBalanceMatches:balance!==null&&balance===report.summary.balanceFen},products};
}
