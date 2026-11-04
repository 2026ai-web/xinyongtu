import {validateAdjustment} from './adjustment-model.js';
import {datasetKey} from './batch-model.js';
export const BACKUP_SCHEMA='xinyongtu-full-backup-2';
export function canonical(value){const clean=JSON.parse(JSON.stringify(value));const encode=v=>Array.isArray(v)?'['+v.map(encode).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+encode(v[k])).join(',')+'}':JSON.stringify(v);return encode(clean);}

export async function digest(payload){const bytes=new TextEncoder().encode(canonical(payload));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
const str=v=>typeof v==='string'&&v.length>0&&v.length<=1000;
const day=v=>/^20\d{2}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const specs={warehouse:['jobs','datasets','meta'],costs:['versions','reports'],history:['history'],adjustments:['events']};
export const normalizePayload=p=>({...structuredClone(p),adjustments:structuredClone(p.adjustments||{events:[]})});
export function validatePayload(p){
 if(!p||typeof p!=='object')throw Error('备份内容缺失');
 for(const [db,stores] of Object.entries(specs))for(const store of stores){const list=p[db]?.[store]??(db==='adjustments'?[]:undefined);if(!Array.isArray(list)||list.length>10000)throw Error('备份表缺失或数量超限：'+db+'/'+store);const seen=new Set();for(const pair of list){if(!Array.isArray(pair)||pair.length!==2||!str(pair[0])||!pair[1]||typeof pair[1]!=='object'||seen.has(pair[0]))throw Error('备份键重复或格式无效：'+store);seen.add(pair[0]);const [key,r]=pair;
  if(db==='warehouse'&&store==='datasets'&&(datasetKey(r)!==key||!str(r.shop)||r.origin!=='https://yingxiao.pinduoduo.com'||!day(r.date)||!['account-day','unit-day'].includes(r.type)))throw Error('推广数据键/日期/来源无效');
  if(store==='jobs'&&(r.id!==key||!str(r.shop)||!Array.isArray(r.dates)||!r.dates.length||!r.dates.every(day)))throw Error('任务身份或日期无效');
  if(store==='meta'&&(!key.startsWith('latest:')||!str(r.id)))throw Error('任务索引无效');
  if(store==='versions'){if(r.id!==key||!day(r.effectiveFrom)||!str(r.importedAt)||!r.costs?.map||typeof r.costs.map!=='object'||!Object.keys(r.costs.map).length)throw Error('成本版本无效');for(const [sku,c] of Object.entries(r.costs.map))if(!str(sku)||!Array.isArray(c.values)||!c.values.length||!c.values.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12))throw Error('成本金额或SKU无效');}
  if(store==='reports'&&(r.id!==key||r.schemaVersion!=='order-cost-accounting-1'||!day(r.date)||!str(r.shopNote)||!Array.isArray(r.details)||!r.summary))throw Error('核算记录结构无效');
  if(db==='adjustments'){validateAdjustment(r);if(r.id!==key)throw Error('调整记录键不符');}
  if(db==='history'&&(key!=='records'||!Array.isArray(r)))throw Error('旧版历史格式无效');
 }}
 if(!Array.isArray(p.preferences)||p.preferences.length>1)throw Error('设置格式无效');for(const [key,value] of p.preferences){if(key!=='batch-preferences'||typeof value!=='string')throw Error('不支持的设置项');const o=JSON.parse(value);if(!o||typeof o!=='object'||typeof o.shop!=='string'||o.shop.length>80)throw Error('店铺设置无效');}
 if((p.adjustments?.events?.length||0)>5000)throw Error('调整记录超过5000条');
 if(p.costs.versions.length>50)throw Error('成本版本超过50个');if(p.warehouse.datasets.length>5000)throw Error('推广数据超过5000份');
}
export async function makeBackup(payload,version='unknown'){payload=normalizePayload(JSON.parse(JSON.stringify(payload)));validatePayload(payload);for(const [,row] of payload.warehouse.datasets)delete row.bytes;return {schemaVersion:BACKUP_SCHEMA,createdAt:new Date().toISOString(),extensionVersion:version,payload,sha256:await digest(payload)};}
export async function checkBackup(file){if(![BACKUP_SCHEMA,'xinyongtu-full-backup-1'].includes(file?.schemaVersion))throw Error('不是本功能生成的完整备份；精简导出或单店旧备份不能直接恢复');if(file.schemaVersion===BACKUP_SCHEMA&&!Array.isArray(file.payload?.adjustments?.events))throw Error('新版备份缺少调整记录表');validatePayload(file.payload);if(!/^[a-f0-9]{64}$/.test(file.sha256||'')||await digest(file.payload)!==file.sha256)throw Error('备份校验失败，文件已损坏或被修改');return normalizePayload(file.payload);}
function comparable(store,value){const r=structuredClone(value);if(store==='datasets')delete r.bytes;if(store==='versions')return {id:r.id,effectiveFrom:r.effectiveFrom,importedAt:r.importedAt,map:r.costs.map};return r;}
export function planRestore(incoming,current){
 validatePayload(incoming);validatePayload(current);incoming=normalizePayload(incoming);current=normalizePayload(current);const merged=structuredClone(current),counts={},conflicts=[];
 for(const [db,stores] of Object.entries(specs))for(const store of stores){const map=new Map(merged[db][store]),stat={add:0,same:0,keepLocal:0,conflicts:0};for(const [key,value] of incoming[db][store]){if(!map.has(key)){map.set(key,structuredClone(value));stat.add++;}else if(canonical(comparable(store,map.get(key)))===canonical(comparable(store,value)))stat.same++;else if(store==='meta')stat.keepLocal++;else{stat.conflicts++;conflicts.push({table:db+'/'+store,key});}}merged[db][store]=[...map];counts[db+'/'+store]=stat;}
 const pref=new Map(current.preferences);for(const [k,v] of incoming.preferences)if(!pref.has(k))pref.set(k,v);merged.preferences=[...pref];validatePayload(merged);
 const keys=new Set(merged.warehouse.datasets.map(([k])=>k)),jobs=new Map(merged.warehouse.jobs);let missingReferences=0;
 for(const [,job] of merged.warehouse.jobs)for(const key of [...Object.values(job.completedDays||{}),...Object.values(job.units||{}).flatMap(u=>Object.values(u.completed||{}))])if(!keys.has(key))missingReferences++;
 for(const [key,r] of merged.warehouse.meta)if(!jobs.has(r.id)||jobs.get(r.id).shop!==key.slice(7))missingReferences++;
 const bytes=merged.warehouse.datasets.reduce((n,[,r])=>{const copy=structuredClone(r);delete copy.bytes;return n+new TextEncoder().encode(JSON.stringify(copy)).length;},0);if(bytes>20*1024*1024)throw Error('恢复后推广仓库超过20MB，已停止');
 return {merged,counts,conflicts,missingReferences,canRestore:!conflicts.length&&!missingReferences,shops:[...new Set([...merged.warehouse.jobs.map(([,r])=>r.shop),...merged.warehouse.datasets.map(([,r])=>r.shop),...merged.costs.reports.map(([,r])=>r.shopNote),...merged.adjustments.events.map(([,r])=>r.shopNote),...merged.history.history.flatMap(([,rows])=>rows.map(r=>r.scope?.shop).filter(Boolean))])],datasetBytes:bytes};
}
