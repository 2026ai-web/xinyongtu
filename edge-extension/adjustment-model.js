export const ADJUSTMENT_SCHEMA='promotion-adjustment-1';
export function beijingInput(iso=new Date().toISOString()){return new Date(Date.parse(iso)+8*3600000).toISOString().slice(0,16);}
export function validateAdjustment(r){
 const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
 if(r?.schemaVersion!==ADJUSTMENT_SCHEMA||!text(r.id,80)||!text(r.shopNote,80)||!/^\d{6,20}$/.test(r.productId)||r.mode!=='稳定成本推广'||r.targetType!=='净目标投产比'||r.source!=='manual-entry'||r.timeZone!=='Asia/Shanghai'||!['active','voided'].includes(r.status))throw Error('调整记录身份或类型无效');
 for(const k of ['before','after'])if(!/^\d{1,4}(?:\.\d{1,4})?$/.test(r[k])||Number(r[k])<=0)throw Error('目标投产须为正数，最多4位小数');
 if(Number(r.before)===Number(r.after))throw Error('调整前后目标投产相同');
 if(!Number.isFinite(Date.parse(r.changedAt))||new Date(r.changedAt).toISOString()!==r.changedAt||!Number.isFinite(Date.parse(r.createdAt))||new Date(r.createdAt).toISOString()!==r.createdAt||r.changedAt>r.createdAt||!text(r.reason,300))throw Error('调整时间或原因无效');
 if(r.status==='voided'&&(!Number.isFinite(Date.parse(r.voidedAt))||new Date(r.voidedAt).toISOString()!==r.voidedAt||r.voidedAt<r.createdAt||!text(r.voidReason,300)))throw Error('作废记录无效');
 return r;
}
export function makeAdjustment({shopNote,productId,localTime,before,after,reason},{id=crypto.randomUUID(),now=new Date().toISOString()}={}){
 if(!String(shopNote||'').trim())throw Error('请先填写顶部店铺备注');if(!/^\d{6,20}$/.test(String(productId||'').trim()))throw Error('商品ID须为6—20位数字');
 if(!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime||''))throw Error('请填写实际调整时间（北京时间）');const date=new Date(localTime+':00+08:00');if(!Number.isFinite(date.getTime())||beijingInput(date.toISOString())!==localTime)throw Error('调整日期或时间无效');
 if(date.toISOString()>now)throw Error('只能记录已经发生的调整，不能填写未来时间');
 return validateAdjustment({schemaVersion:ADJUSTMENT_SCHEMA,id,shopNote:String(shopNote||'').trim(),productId:String(productId||'').trim(),mode:'稳定成本推广',targetType:'净目标投产比',source:'manual-entry',timeZone:'Asia/Shanghai',changedAt:date.toISOString(),createdAt:now,before:String(before||'').trim(),after:String(after||'').trim(),reason:String(reason||'').trim(),status:'active'});
}
export function adjustmentExport(records,shop,dates){
 const first=dates[0]+'T00:00:00+08:00',last=dates.at(-1)+'T23:59:59.999+08:00';
 const rows=records.filter(r=>r.shopNote===shop).map(r=>{validateAdjustment(r);return {...structuredClone(r),relationToSelectedDates:Date.parse(r.changedAt)<Date.parse(first)?'before-period':Date.parse(r.changedAt)>Date.parse(last)?'after-period':dates.includes(beijingInput(r.changedAt).slice(0,10))?'within-period':'between-selected-dates'};}).sort((a,b)=>a.changedAt.localeCompare(b.changedAt)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 return {source:'manual-entries-only',historyComplete:false,automaticShopOperation:false,records:rows,guide:'人工记录，仅说明用户填写的调整，不认证平台已执行或设置持续生效。时间为北京时间转UTC保存；按实际调整时间区分所选日期前/期间/后，after-period不能解释较早表现。voided记录只留审计、不用于效果分析。缺记录不等于没有调整，前后变化不自动证明因果。'};
}
