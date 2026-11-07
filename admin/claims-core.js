(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClaimsCore=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const FB='https://kozonko-9bff6-default-rtdb.europe-west1.firebasedatabase.app';
 const statuses={new:'Новая',in_progress:'В работе',processed:'Обработана',disputed:'Оспорена',closed:'Закрыта'};
 const values=x=>Object.values(x||{}).filter(v=>v&&typeof v==='object');
 const copy=x=>JSON.parse(JSON.stringify(x||{}));
 const cleanId=x=>{const s=String(x||'');if(!s||/[.#$\[\]\/\u0000-\u001f]/.test(s))throw Error('Некорректный ID');return s;};
 const date=x=>{if(!x)return '';const s=String(x).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:'';};
 const amount=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))?Number(x):null;
 const name=e=>e.fullName||e.name||e.id||'Без имени';
 function ledgerRows(employees){
  const rows=[];
  for(const [employeeIndex,e] of Object.entries(employees||{})){
   if(!e||typeof e!=='object')continue;
   for(const [field,state] of [['deductions','active'],['deductionHistory','written_off']]){
    for(const [index,d] of Object.entries(e[field]||{})){
     if(!d||typeof d!=='object')continue;
     const signed=amount(d.amount);
     rows.push({id:`${employeeIndex}/${field}/${index}`,employeeId:e.id||'',employee:name(e),state,kind:signed===null?'invalid':signed<0?'deduction':signed>0?'credit':'zero',signedAmount:signed,amount:signed===null?null:Math.abs(signed),date:date(d.date),accountDate:date(d.accountDate),reportDate:date(state==='active'?d.date:d.accountDate),reason:d.reason||'',accounted:d.accounted===true,marketplace:['ozon','wb','yandex'].includes(d.marketplace)?d.marketplace:'unknown',claimId:d.claim_id||'',pvzId:d.pvz_id||'',source:`/appData/employees/${employeeIndex}/${field}/${index}`});
    }
   }
  }
  return rows;
 }
 function filterLedger(rows,f={}){return rows.filter(r=>(!f.kind||r.kind===f.kind)&&(!f.state||r.state===f.state)&&(!f.employeeId||r.employeeId===f.employeeId)&&(!f.marketplace||r.marketplace===f.marketplace)&&(!f.from||(r.reportDate&&r.reportDate>=f.from))&&(!f.to||(r.reportDate&&r.reportDate<=f.to))&&(!f.query||`${r.reason} ${r.employee} ${r.claimId}`.toLowerCase().includes(f.query.toLowerCase())));}
 function shiftCandidates(tabs,employees,pvzId,eventDate){
  const a=tabs?.[pvzId]?.monthData?.[String(eventDate).slice(0,7)]?.assignments?.[eventDate];
  const ids=new Set([a?.employeeId,a?.second?.employeeId].filter(Boolean));
  return values(employees).filter(e=>ids.has(e.id));
 }
 function normalizeClaims(data){
  const out=[];
  for(const [id,v] of Object.entries(data||{}))if(/^\d+$/.test(id)&&v&&typeof v==='object')out.push({id,marketplace:'ozon',path:`/claims/${id}`,data:v});
  for(const m of ['wb','yandex'])for(const [id,v] of Object.entries(data?.[m]?.active||{}))if(v&&typeof v==='object')out.push({id,marketplace:m,path:`/claims/${m}/active/${id}`,data:v});
  return out;
 }
 function claimReport(data,f={}){
  const base=normalizeClaims(data).filter(r=>['ozon','yandex'].includes(r.marketplace)&&(!f.marketplace||r.marketplace===f.marketplace)&&(!f.claimstatus||(r.data.processing?.status||'untracked')===f.claimstatus)&&(!f.claimpvz||String(r.data.pvz_code||r.data.pvz||r.data.pvz_address||'').toLowerCase().includes(f.claimpvz.toLowerCase())));
  const inPeriod=d=>(!f.from||(d&&d>=f.from))&&(!f.to||(d&&d<=f.to));
  const claims=base.filter(r=>(!f.employeeId||r.data.responsibility?.employee_id===f.employeeId)&&inPeriod(date(r.data.claim_date||r.data.created_at||r.data.created_date)));
  const finance=base.flatMap(r=>Object.entries(r.data.financial_events||{}).filter(([,e])=>e&&typeof e==='object').map(([id,e])=>({claim:r,id,...e}))).filter(e=>(!f.employeeId||e.responsibility?.employee_id===f.employeeId)&&(!f.claimtype||e.type===f.claimtype)&&inPeriod(date(e.payment_date)));
  return {claims,finance};
 }
 const collectedFields=['marketplace','claim_id','claim_uuid','source_claim_id','campaign_id','store_id','pvz_code','pvz_address','amount','reason_raw','marketplace_status','ozon_status','claim_date','deadline_at','claim_url','item_barcode','item_barcodes','item_name','items','order_reference','order_url','marketplace_messages','source_url','source_kind','linked_claim_id','source_text','outlet_id'];
 function validateCollected(incoming){
  cleanId(incoming.claim_id);if(!['ozon','yandex'].includes(incoming.marketplace))throw Error('Неизвестный маркетплейс');
  const missing=[];
  if(amount(incoming.amount)===null||amount(incoming.amount)<0)missing.push('сумма');
  if(!String(incoming.pvz_code||incoming.pvz_address||'').trim())missing.push('ПВЗ');
  if(!date(incoming.claim_date))missing.push('дата претензии');
  if(!incoming.marketplace_status&&!incoming.ozon_status)missing.push('статус маркетплейса');
  if(!incoming.reason_raw)missing.push('причина');
  if(missing.length)throw Error('Не получены обязательные поля: '+missing.join(', '));
 }
 function mergeCollected(old,incoming,now){
  validateCollected(incoming);
  const n=copy(old);
  for(const k of collectedFields)if(incoming[k]!==undefined&&incoming[k]!==null&&incoming[k]!=='')n[k]=copyValue(incoming[k]);
  n.collected_at=now;n.source_url=incoming.source_url||incoming.claim_url||'';
  if(!old){n.processing={status:'new',created_at:now};n.history={collected:{ts:now,type:'added',text:'Сохранено из браузера'}};}
  return n;
 }
 function copyValue(v){return JSON.parse(JSON.stringify(v));}
 function operator(x){const s=String(x||'').trim();if(!s)throw Error('Укажите подпись оператора');return s;}
 function workflowChange(old,input,eventId,now){
  if(!statuses[input.status])throw Error('Неизвестный статус обработки');
  const by=operator(input.operator),n=copy(old);cleanId(eventId);
  n.processing={...(n.processing||{}),status:input.status,updated_at:now,operator:by,note:String(input.note||'')};
  if(input.status==='in_progress'&&!n.processing.started_at)n.processing.started_at=now;
  if(['processed','closed'].includes(input.status))n.processing.completed_at=now;
  n.history={...(n.history||{}),[eventId]:{ts:now,type:'processing',operator:by,text:`${statuses[input.status]}${input.note?' · '+input.note:''}`}};return n;
 }
 function financialChange(old,input,eventId,now){
  if(old?.history?.[eventId]?.type==='financial')return copy(old);
  const sum=amount(input.amount),by=operator(input.operator);cleanId(eventId);
  if(sum===null||sum<=0)throw Error('Введите положительную сумму');
  for(const k of ['event_date','claim_date','payment_date'])if(input[k]&&!date(input[k]))throw Error('Некорректная дата');
  if(!date(input.payment_date))throw Error('Укажите дату списания или оплаты');
  if(!['employee','company','review'].includes(input.responsibility))throw Error('Выберите ответственность');
  if(!['writeoff','payment'].includes(input.type))throw Error('Выберите тип финансового события');
  if(input.responsibility==='employee')cleanId(input.employee_id);
  const n=copy(old),decision={kind:input.responsibility,employee_id:input.responsibility==='employee'?input.employee_id:'',comment:String(input.comment||''),confirmed_by:by,confirmed_at:now};
  const key=input.event_id?cleanId(input.event_id):eventId;
  if(input.event_id&&!n.financial_events?.[key])throw Error('Финансовое событие не найдено');
  const event={amount:sum,type:input.type,event_date:input.event_date||'',claim_date:input.claim_date||'',payment_date:input.payment_date,operator:by,created_at:n.financial_events?.[key]?.created_at||now,updated_at:now,responsibility:decision};
  n.financial_events={...(n.financial_events||{}),[key]:event};n.responsibility=decision;
  n.history={...(n.history||{}),[eventId]:{ts:now,type:'financial',operator:by,financial_event_id:key,snapshot:event,previous:old?.financial_events?.[key]||null,text:`${input.type==='writeoff'?'Списание':'Оплата'}: ${sum} ₽ · ${decision.kind==='employee'?'сотрудник '+decision.employee_id:decision.kind==='company'?'за счёт компании':'требуется проверка'}${decision.comment?' · '+decision.comment:''}`}};return n;
 }
 function createClient(transport){
  const send=transport|| (async(url,opt)=>{const r=await fetch(url,opt);return {status:r.status,etag:r.headers.get('ETag'),text:await r.text()};});
  const url=path=>{if(!/^\/(claims|appData|supplies)(\/|$)/.test(path)||path.includes('..')||/[?#]/.test(path))throw Error('Недопустимый путь');return FB+path+'.json';};
  async function get(path){const r=await send(url(path),{method:'GET'});if(r.status!==200)throw Error('Firebase: чтение HTTP '+r.status);return JSON.parse(r.text);}
  async function transact(path,change){
   for(let i=0;i<5;i++){
    const r=await send(url(path),{method:'GET',headers:{'X-Firebase-ETag':'true'}});
    if(r.status!==200||!r.etag)throw Error('Firebase: не удалось получить версию записи (HTTP '+r.status+')');
    const next=change(JSON.parse(r.text));
    const w=await send(url(path),{method:'PUT',headers:{'Content-Type':'application/json','if-match':r.etag},body:JSON.stringify(next)});
    if(w.status===412)continue;if(w.status!==200)throw Error('Firebase: сохранение HTTP '+w.status);return next;
   }throw Error('Запись менялась параллельно. Повторите сохранение.');
  }
  return {get,transact};
 }
 return {FB,statuses,values,name,date,amount,cleanId,ledgerRows,filterLedger,shiftCandidates,normalizeClaims,claimReport,validateCollected,mergeCollected,workflowChange,financialChange,createClient};
});
