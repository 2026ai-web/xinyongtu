export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;const s=text.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){const c=s[i];if(quoted){if(c==='"'&&s[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"'){if(cell)throw Error('CSV引号位置错误');quoted=true;}else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV引号未闭合');row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}
export function moneyFen(value){const s=String(value??'').trim();if(!/^\d+(?:\.\d{1,6})?$/.test(s))throw Error('金额为空或格式不正确：'+s);const [whole,frac='']=s.split('.'),n=Number(whole)*100+Number((frac+'00').slice(0,2))+(Number(frac[2]||0)>=5?1:0);if(!Number.isSafeInteger(n)||n>1e12)throw Error('金额超出范围');return n;}
export function makeCostMap(rows){const header=rows[0]||[],code=header.indexOf('商家编码-规格维度'),total=header.indexOf('单个SKU总成本');if(code<0||total<0)throw Error('成本表缺少SKU编码或单个SKU总成本列');const map={};let duplicates=0;
 for(const row of rows.slice(1)){const sku=String(row[code]??'').trim();if(!sku)continue;const value=moneyFen(row[total]);if(Object.hasOwn(map,sku)){duplicates++;if(!map[sku].values.includes(value))map[sku].values.push(value);}else Object.defineProperty(map,sku,{value:{values:[value]},enumerable:true});}
 if(!Object.keys(map).length)throw Error('成本表没有有效SKU');return {map,skuCount:Object.keys(map).length,duplicates,conflicts:Object.keys(map).filter(k=>map[k].values.length!==1)};
}
export function calculateOrders(rows,costVersion,{date,shop,adSpendFen=null,adEvidence=null}={}){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date||'')||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('请明确确认订单所属日期');if(!shop?.trim())throw Error('请填写店铺备注');if(!costVersion||costVersion.effectiveFrom>date)throw Error('所选日期没有适用成本版本');
 const headers=rows[0]||[],required=['订单号','订单状态','商品数量(件)','商品id','商家编码-规格维度','售后状态','商家实收金额(元)'];for(const name of required)if(headers.filter(x=>x===name).length!==1)throw Error('订单CSV缺少或重复列：'+name);
 const seen=new Set(),details=[],issues=[];let revenueFen=0,skuCostFen=0,included=0,excluded=0,quantity=0;
 for(const [i,values] of rows.slice(1).entries()){
  if(values.length!==headers.length)throw Error('CSV第'+(i+2)+'行列数不符');const r=Object.fromEntries(headers.map((h,k)=>[h,String(values[k]??'').trim()])),id=r['订单号'];if(!id||seen.has(id))throw Error('订单号为空或重复，第'+(i+2)+'行');seen.add(id);
  const status=r['订单状态'],afterSale=r['售后状态'],base={orderId:id,productId:r['商品id'],sku:r['商家编码-规格维度'],status,afterSale};
  if(/取消|退款/.test(status)||['退款成功','售后处理中'].includes(afterSale)){excluded++;details.push({...base,included:false,reason:'取消/退款/售后处理中，收入与成本均剔除'});continue;}
  if(!['已发货，待收货','已收货'].includes(status)||afterSale!=='无售后或售后取消'){issues.push('第'+(i+2)+'行订单/售后状态未支持');details.push({...base,included:false,reason:'状态待确认'});continue;}
  const q=Number(r['商品数量(件)']);if(!/^\d+$/.test(r['商品数量(件)'])||!Number.isSafeInteger(q)||q<=0||q>1000000)throw Error('购买件数无效，第'+(i+2)+'行');const amount=moneyFen(r['商家实收金额(元)']);const cost=Object.hasOwn(costVersion.costs.map,base.sku)?costVersion.costs.map[base.sku]:null;
  if(!cost||cost.values.length!==1){issues.push('SKU未匹配或成本冲突：'+base.sku);details.push({...base,included:false,reason:'成本待确认',quantity:q,revenueFen:amount});continue;}
  const fullCost=cost.values[0]*q;revenueFen+=amount;skuCostFen+=fullCost;quantity+=q;included++;if(!Number.isSafeInteger(revenueFen)||!Number.isSafeInteger(skuCostFen)||revenueFen>1e12)throw Error('汇总金额超出精确范围');
  details.push({...base,included:true,quantity:q,revenueFen:amount,unitFullCostFen:cost.values[0],skuCostFen:fullCost});
 }
 if(!details.length)throw Error('订单CSV没有数据');if(adSpendFen!==null&&(!Number.isSafeInteger(adSpendFen)||adSpendFen<0))throw Error('推广花费无效');const platformFeeFen=Math.floor((revenueFen*35+500)/1000),complete=!issues.length&&adSpendFen!==null;
 return {schemaVersion:'order-cost-accounting-1',shopNote:shop,date,dateSource:'user-confirmed-order-day',createdAt:new Date().toISOString(),costVersion:{id:costVersion.id,effectiveFrom:costVersion.effectiveFrom,importedAt:costVersion.importedAt},rules:{exclude:'取消/退款成功/售后处理中订单的收入和成本均剔除；无售后或售后取消可纳入',skuCost:'整套SKU成本乘购买件数',platformFee:'纳入订单实收合计×3.5%，合计四舍五入到分',adSpend:'扣同日全部账户总花费，不分摊，不重复加扣托管共享花费',resultLabel:'剔除售后及取消订单后的经营结余'},complete,issues,summary:{totalOrders:details.length,includedOrders:included,excludedOrders:excluded,pendingOrders:details.length-included-excluded,quantity,revenueFen,skuCostFen,platformFeeFen,beforeAdBalanceFen:issues.length?null:revenueFen-skuCostFen-platformFeeFen,adSpendFen,balanceFen:complete?revenueFen-skuCostFen-platformFeeFen-adSpendFen:null},adEvidence,details};
}
