// ==UserScript==
// @name         ПВЗ — претензии Ozon и Яндекса
// @namespace    local.pvz.claims
// @version      1.1.0
// @description  Сбор открытой претензии и внутренняя обработка в Firebase
// @match        https://turbo-pvz.ozon.ru/*
// @match        https://hubs.market.yandex.ru/*
// @match        https://mail.yandex.ru/*
// @match        https://logistics.market.yandex.ru/common/cabinets*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      kozonko-9bff6-default-rtdb.europe-west1.firebasedatabase.app
// @connect      identitytoolkit.googleapis.com
// @connect      securetoken.googleapis.com
// @connect      hubs.market.yandex.ru
// @connect      turbo-pvz.ozon.ru
// @updateURL    https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/scripts/claims-assistant.user.js
// @downloadURL  https://pvz-r1y3rpb24ilcjhbgcioijiuzi1nij.github.io/pvzkozonko/scripts/claims-assistant.user.js
// @run-at       document-start
// @noframes
// ==/UserScript==

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

;
(function(root){
 'use strict';
 const C=root.ClaimsCore;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>n===null||n===undefined?'—':Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
 const label={ozon:'Ozon',wb:'Wildberries',yandex:'Яндекс Маркет',unknown:'Не указан'};
 const uid=()=>crypto.randomUUID();
 const css=`:host{display:block;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#20232a}*{box-sizing:border-box}h1,h2{font-size:20px;margin:0 0 10px}h3{font-size:15px;margin:18px 0 8px}p{margin:6px 0 12px}label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#555}input,select,textarea,button{font:inherit;border:1px solid #d4d8df;border-radius:5px;padding:8px;background:white;color:#20232a;max-width:100%}textarea{min-height:65px;resize:vertical}button{cursor:pointer}button:hover{background:#f2f4f7}button:disabled{opacity:.5;cursor:wait}button.primary{background:#245eaf;color:white;border-color:#245eaf}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:2px solid #245eaf;outline-offset:2px}a{color:#245eaf}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.wide{grid-column:1/-1}.muted{color:#686f7b;font-size:12px}.error{color:#ad2020}.success{color:#237044}.rule{border-top:1px solid #e0e3e8;margin-top:18px;padding-top:8px}.summary{font-size:18px;font-variant-numeric:tabular-nums}.scroll{overflow:auto;max-height:440px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #e0e3e8;vertical-align:top}th{position:sticky;top:0;background:white;color:#686f7b;font-weight:500}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}pre{white-space:pre-wrap;word-break:break-word;font:inherit;max-height:350px;overflow:auto}.filters{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.filters label{min-width:130px}.check{display:flex;flex-direction:row;align-items:flex-start}.notice{padding:10px;background:#f4f5f7}details{margin:10px 0}summary{cursor:pointer}@media(max-width:600px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.filters label{flex:1 1 130px}}`;
 function frame(host){const s=host.shadowRoot||host.attachShadow({mode:'open'});s.innerHTML='<style>'+css+'</style><div id="content"></div>';return s;}
 const opts=(values,chosen)=>Object.entries(values).map(([v,t])=>`<option value="${esc(v)}"${v===chosen?' selected':''}>${esc(t)}</option>`).join('');
 async function workflow(host,path,{client=C.createClient(),onSaved=()=>{}}={}){
  const s=frame(host),box=s.querySelector('#content');box.textContent='Загрузка обработки и графика…';
  let claim,employees,tabs;
  try{[claim,employees,tabs]=await Promise.all([client.get(path),client.get('/appData/employees'),client.get('/appData/tabs')]);if(!claim)throw Error('Претензия ещё не сохранена');}
  catch(e){if(s.getElementById('content')!==box)return;box.innerHTML=`<p class="error">${esc(e.message)}</p><button id="retry">Повторить</button>`;box.querySelector('#retry').onclick=()=>workflow(host,path,{client,onSaved});return;}
  if(s.getElementById('content')!==box)return;
  let operator='';try{operator=localStorage.getItem('claims_operator')||'';}catch{}
  box.innerHTML=`<h3>Обработка и финансовые события</h3><p class="muted">Подпись оператора вводится вручную. Она не подтверждает личность.</p>
   <label>Подпись оператора<input id="operator" value="${esc(operator)}" required></label>
   <form id="processing" class="grid rule"><label>Статус обработки<select id="status">${opts(C.statuses,claim.processing?.status||'new')}</select></label><label>Заметка<textarea id="note">${esc(claim.processing?.note||'')}</textarea></label><div class="wide row"><button class="primary">Сохранить обработку</button><span id="procmsg" role="status"></span></div></form>
   <h3>ПВЗ и сотрудники смены</h3><div class="grid"><label>ПВЗ<select id="pvz"><option value="">Выберите ПВЗ</option>${opts(Object.fromEntries(Object.entries(tabs||{}).map(([id,t])=>[id,t.name||id])),claim.pvz_firebase_id||claim.pvz_id||'')}</select></label><label>Дата события<input id="eventdate" type="date" value="${esc(C.date(claim.event_date))}"></label></div><p id="candidates" class="notice"></p><button id="savepvz">Сохранить связь с ПВЗ и дату события</button><span id="pvzmsg" role="status"></span>
   <h3>Списание или оплата</h3><p class="muted">Ответственность подтверждает человек. Это решение не создаёт вычет из зарплаты.</p>
   <form id="finance" class="grid"><label>Тип события<select id="ftype"><option value="writeoff">Списание маркетплейса</option><option value="payment">Оплата претензии</option></select></label><label>Сумма, ₽<input id="amount" type="number" min="0.01" step="0.01" value="${esc(claim.amount??claim.sum??'')}" required></label>
   <label>Дата претензии<input id="claimdate" type="date" value="${esc(C.date(claim.claim_date||claim.created_date||claim.created_at))}"></label><label>Дата списания или оплаты<input id="paymentdate" type="date" required></label>
   <label>За чей счёт<select id="responsibility"><option value="review">Требуется проверка</option><option value="company">За счёт компании</option><option value="employee">Выбранный сотрудник</option></select></label>
   <label>Сотрудник<select id="employee" disabled><option value="">Выберите сотрудника</option>${opts(Object.fromEntries(C.values(employees).map(e=>[e.id,C.name(e)])),'')}</select></label>
   <label class="wide">Комментарий<textarea id="comment"></textarea></label>
   <label class="wide check"><input id="confirmed" type="checkbox" required>Подтверждаю сумму, даты и выбранную ответственность</label>
   <div class="wide row"><button class="primary">Зарегистрировать событие</button><span id="finmsg" role="status"></span></div></form>
   <div id="events"></div><details><summary>История обработки и решений</summary><div id="timeline"></div></details><p class="muted">Источник: ${esc(path)}</p>`;
  const el=id=>box.querySelector('#'+id);
  function candidates(){const list=C.shiftCandidates(tabs,employees,el('pvz').value,el('eventdate').value);el('candidates').textContent=!el('pvz').value||!el('eventdate').value?'Выберите ПВЗ и дату события.':list.length?'По плану работали: '+list.map(C.name).join(', ')+'. График не доказывает ответственность.':'Назначений на эту дату нет. Можно выбрать сотрудника вручную.';}
  el('pvz').onchange=candidates;el('eventdate').onchange=candidates;candidates();
  el('responsibility').onchange=()=>{el('employee').disabled=el('responsibility').value!=='employee';el('employee').required=!el('employee').disabled;};
  function events(){
   const list=Object.entries(claim.financial_events||{});
   el('events').innerHTML=list.length?'<h3>Зарегистрировано</h3>'+list.map(([id,e])=>`<p>${esc(e.payment_date)} · ${money(e.amount)} · ${e.type==='payment'?'Оплата':'Списание'} · ${esc(e.responsibility?.kind==='employee'?C.name(C.values(employees).find(x=>x.id===e.responsibility.employee_id)||{name:e.responsibility.employee_id}):e.responsibility?.kind==='company'?'За счёт компании':'Требуется проверка')} <button data-edit="${esc(id)}">Уточнить решение</button></p>`).join(''):'<p class="muted">Финансовых событий нет.</p>';
   el('events').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const e=claim.financial_events[b.dataset.edit];el('finance').dataset.eventId=b.dataset.edit;
    el('ftype').value=e.type;el('amount').value=e.amount;el('claimdate').value=e.claim_date||'';el('paymentdate').value=e.payment_date||'';el('eventdate').value=e.event_date||'';
    el('responsibility').value=e.responsibility?.kind||'review';el('responsibility').onchange();el('employee').value=e.responsibility?.employee_id||'';el('comment').value=e.responsibility?.comment||'';el('confirmed').checked=false;el('finance').querySelector('button').textContent='Сохранить уточнение';candidates();
   });
   el('timeline').innerHTML=C.values(claim.history).sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||''))).map(e=>`<p><span class="muted">${esc(e.ts)} ${esc(e.operator||'')}</span><br>${esc(e.text||e.type)}</p>`).join('')||'<p>Событий нет.</p>';
  }events();
  async function save(form,msg,change){const button=form.querySelector('button');button.disabled=true;msg.className='';msg.textContent='Сохраняю…';try{claim=await client.transact(path,old=>{if(!old)throw Error('Карточка удалена');return change(old);});try{localStorage.setItem('claims_operator',el('operator').value);}catch{}msg.textContent='Сохранено';msg.className='success';events();onSaved(claim);return true;}catch(e){msg.textContent=e.message;msg.className='error';return false;}finally{button.disabled=false;}}
  el('processing').onsubmit=e=>{e.preventDefault();const id=uid(),now=new Date().toISOString();save(e.currentTarget,el('procmsg'),old=>C.workflowChange(old,{status:el('status').value,operator:el('operator').value,note:el('note').value},id,now));};
  el('savepvz').onclick=()=>{
   const p=el('pvz').value,d=el('eventdate').value,by=el('operator').value.trim();if(!p||!d||!by){el('pvzmsg').textContent='Укажите ПВЗ, дату и подпись оператора';return;}
   const id=uid(),ts=new Date().toISOString();save(box,el('pvzmsg'),old=>({...old,pvz_firebase_id:p,event_date:d,history:{...(old.history||{}),[id]:{ts,type:'pvz_link',operator:by,text:`ПВЗ: ${tabs[p].name||p}, дата события: ${d}`}}}));
  };
  const pendingKey='claims_pending_finance:'+path;let pendingFinance=null;
  try{pendingFinance=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch{}
  if(pendingFinance){
   const p=pendingFinance.input;
   for(const [id,k] of Object.entries({amount:'amount',ftype:'type',eventdate:'event_date',claimdate:'claim_date',paymentdate:'payment_date',responsibility:'responsibility',employee:'employee_id',operator:'operator',comment:'comment'}))el(id).value=p[k]||'';
   el('finance').querySelectorAll('input,select,textarea').forEach(x=>x.disabled=true);
   el('finmsg').textContent='Есть неподтверждённое сохранение. Повтор использует прежний номер операции.';el('finance').querySelector('button').textContent='Повторить сохранение';candidates();
  }
  el('finance').onsubmit=async e=>{e.preventDefault();if(!el('confirmed').checked&&!pendingFinance)return;
   const input={amount:el('amount').value,type:el('ftype').value,event_date:el('eventdate').value,claim_date:el('claimdate').value,payment_date:el('paymentdate').value,responsibility:el('responsibility').value,employee_id:el('employee').value,operator:el('operator').value,comment:el('comment').value,event_id:el('finance').dataset.eventId||''};
   if(input.responsibility==='employee'&&!C.values(employees).some(x=>x.id===input.employee_id)){el('finmsg').textContent='Выберите существующего сотрудника';return;}
   if(!pendingFinance){const id=uid(),now=new Date().toISOString();try{C.financialChange(claim,input,id,now);}catch(err){el('finmsg').textContent=err.message;return;}pendingFinance={input,id,now};try{sessionStorage.setItem(pendingKey,JSON.stringify(pendingFinance));}catch{}}
   const op=pendingFinance;const ok=await save(e.currentTarget,el('finmsg'),old=>C.financialChange(old,op.input,op.id,op.now));
   el('finance').querySelectorAll('input,select,textarea').forEach(x=>x.disabled=!ok);
   if(ok){pendingFinance=null;try{sessionStorage.removeItem(pendingKey);}catch{}el('finance').dataset.eventId='';el('confirmed').checked=false;el('finance').querySelector('button').textContent='Зарегистрировать событие';el('responsibility').onchange();}
   else{el('finmsg').textContent+=' Сохранение не подтверждено. Повтор использует тот же номер операции.';el('finance').querySelector('button').textContent='Повторить сохранение';}
  };
 }
 async function report(host,{client=C.createClient()}={}){
  const s=frame(host),box=s.getElementById('content');box.textContent='Загрузка удержаний и претензий…';
  let employees,claims;
  try{[employees,claims]=await Promise.all([client.get('/appData/employees'),client.get('/claims')]);}catch(e){box.innerHTML=`<p class="error">${esc(e.message)}</p><button id="retry">Повторить</button>`;s.getElementById('retry').onclick=()=>report(host,{client});return;}
  const all=C.ledgerRows(employees),now=new Date().toISOString();
  box.innerHTML=`<h1>Удержания сотрудников</h1><p>Активные и списанные записи из действующего календаря, по всем сотрудникам.</p><p class="muted">Активные — по дате регистрации, списанные — по дате списания. Положительные начисления показаны отдельно. История ограничена сохранёнными записями.</p>
   <div class="filters"><label>С даты<input id="from" type="date"></label><label>По дату<input id="to" type="date"></label><label>Сотрудник<select id="employee"><option value="">Все сотрудники</option>${opts(Object.fromEntries(C.values(employees).map(e=>[e.id,C.name(e)])),'')}</select></label><label>Состояние<select id="state"><option value="">Все состояния</option><option value="active">Активные</option><option value="written_off">Списанные</option></select></label><label>Тип записи<select id="kind"><option value="deduction">Удержания</option><option value="credit">Начисления</option><option value="">Все записи</option><option value="invalid">Ошибки суммы</option></select></label><label>Маркетплейс<select id="marketplace"><option value="">Все</option>${opts(label,'')}</select></label><label>Поиск<input id="query" type="search" placeholder="Причина или сотрудник"></label></div>
   <div class="row"><button id="export">Скачать Excel</button><button id="reload">Обновить</button><span id="summary" class="summary" role="status"></span></div><p id="warning" class="muted"></p><div class="scroll"><table><thead><tr><th>Сотрудник</th><th>Состояние</th><th>Регистрация</th><th>Списание</th><th>Причина</th><th class="num">Сумма</th><th>Маркетплейс</th><th>Учтено</th></tr></thead><tbody id="rows"></tbody></table></div>
   <details><summary>Сводка по сотрудникам</summary><div id="grouped"></div></details><h3>Претензии Ozon и Яндекса</h3><p class="muted">Отдельные показатели из сохранённых карточек. Не складываются с зарплатными удержаниями. Период — дата создания претензии; даты без значения исключаются только при фильтре периода. Историческая полнота не подтверждена.</p><div class="filters"><label>Статус обработки<select id="claimstatus"><option value="">Все статусы</option><option value="untracked">Не зарегистрирована</option>${opts(C.statuses,'')}</select></label><label>ПВЗ<input id="claimpvz" placeholder="Код или адрес"></label><label>Финансовое событие<select id="claimtype"><option value="">Все типы</option><option value="writeoff">Списание</option><option value="payment">Оплата</option></select></label></div><div id="claimstats"></div><div class="scroll" id="claimrows"></div><p class="muted">Данные загружены: ${esc(now)} · /appData/employees и /claims</p>`;
  const el=id=>s.getElementById(id);let filtered=[],selectedClaims=[],financeRows=[],filters={};
  function refresh(){
   filters=Object.fromEntries(['from','to','employee','state','kind','marketplace','query','claimstatus','claimpvz','claimtype'].map(k=>[k==='employee'?'employeeId':k,el(k).value]));
   if(filters.from&&filters.to&&filters.from>filters.to){el('warning').textContent='Начало периода позже конца';el('export').disabled=true;return;}el('export').disabled=false;
   filtered=C.filterLedger(all,filters);
   const deductions=filtered.filter(r=>r.kind==='deduction'),credits=filtered.filter(r=>r.kind==='credit');
   el('summary').textContent=`${filtered.length} записей · удержания ${money(deductions.reduce((a,r)=>a+r.amount,0))} · начисления ${money(credits.reduce((a,r)=>a+r.amount,0))}`;
   el('warning').textContent=`Без даты: ${all.filter(r=>!r.reportDate).length}. Без маркетплейса: ${all.filter(r=>r.marketplace==='unknown').length}. С неверной суммой: ${all.filter(r=>r.kind==='invalid').length}.`;
   el('rows').innerHTML=filtered.map(r=>`<tr><td>${esc(r.employee)}</td><td>${r.state==='active'?'Активно':'Списано'}${r.kind==='credit'?' · начисление':''}</td><td style="white-space:nowrap">${esc(r.date||'—')}</td><td style="white-space:nowrap">${esc(r.accountDate||'—')}</td><td>${esc(r.reason)}<details><summary>Источник</summary>${esc(r.source)}</details></td><td class="num">${money(r.amount)}</td><td>${esc(label[r.marketplace])}</td><td>${r.accounted?'Да':'Нет'}</td></tr>`).join('')||'<tr><td colspan="8">Записей по этим фильтрам нет.</td></tr>';
   const groups={};for(const r of filtered){const k=r.employeeId||r.employee;groups[k]||={name:r.employee,active:0,history:0,credit:0};if(r.kind==='deduction')groups[k][r.state==='active'?'active':'history']+=r.amount;else if(r.kind==='credit')groups[k].credit+=r.amount;}
   el('grouped').innerHTML='<div class="scroll"><table><tr><th>Сотрудник</th><th class="num">Активные удержания</th><th class="num">Списанные</th><th class="num">Начисления</th></tr>'+Object.values(groups).map(g=>`<tr><td>${esc(g.name)}</td><td class="num">${money(g.active)}</td><td class="num">${money(g.history)}</td><td class="num">${money(g.credit)}</td></tr>`).join('')+'</table></div>';
   const analysis=C.claimReport(claims,filters);selectedClaims=analysis.claims;
   const processing={};for(const r of selectedClaims){const st=C.statuses[r.data.processing?.status]||'Обработка не зарегистрирована';processing[st]=(processing[st]||0)+1;}
   financeRows=analysis.finance;
   const total=kind=>financeRows.filter(e=>e.responsibility?.kind===kind).reduce((a,e)=>a+(C.amount(e.amount)||0),0);
   el('claimstats').innerHTML=`<p>${selectedClaims.length} карточек. ${Object.entries(processing).map(([k,v])=>esc(k)+': '+v).join(' · ')}</p><p>По финансовым событиям: сотрудники ${money(total('employee'))} · компания ${money(total('company'))} · требуется проверка ${money(total('review'))}. Дата финансового события — дата оплаты или списания.</p>`;
   el('claimrows').innerHTML='<table><tr><th>Претензия</th><th>ПВЗ</th><th>Обработка</th><th class="num">Сумма претензии</th></tr>'+selectedClaims.map(r=>`<tr><td><a href="claims.html?claim=${encodeURIComponent(r.marketplace+':'+r.id)}">${esc(label[r.marketplace])} ${esc(r.id)}</a></td><td>${esc(r.data.pvz_code||r.data.pvz||r.data.pvz_address||'—')}</td><td>${esc(C.statuses[r.data.processing?.status]||'Не зарегистрирована')}</td><td class="num">${money(C.amount(r.data.amount??r.data.sum))}</td></tr>`).join('')+'</table>';
   el('export').onclick=()=>{
    root.ClaimsXlsx.download([{name:'Удержания',rows:[['Сотрудник','Состояние','Тип','Дата регистрации','Дата списания','Причина','Сумма','Исходная сумма','Маркетплейс','Учтено','ID претензии','Источник'],...filtered.map(r=>[r.employee,r.state==='active'?'Активно':'Списано',r.kind,r.date,r.accountDate,r.reason,r.amount,r.signedAmount,label[r.marketplace],r.accounted?'Да':'Нет',r.claimId,r.source])]},
     {name:'Сводка',rows:[['Сотрудник','Активные удержания','Списанные удержания','Начисления'],...Object.values(groups).map(g=>[g.name,g.active,g.history,g.credit])]},
     {name:'Претензии',rows:[['Маркетплейс','ID','Статус обработки','Дата претензии','Сумма','Источник'],...selectedClaims.map(r=>[label[r.marketplace],r.id,C.statuses[r.data.processing?.status]||'Не зарегистрирована',r.data.claim_date||r.data.created_at||r.data.created_date||'',C.amount(r.data.amount??r.data.sum),r.path])]},
     {name:'Финансовые события',rows:[['Маркетплейс','Претензия','Тип','Дата события','Дата претензии','Дата списания или оплаты','Сумма','Ответственность','Сотрудник','Комментарий','Источник'],...financeRows.map(e=>[label[e.claim.marketplace],e.claim.id,e.type,e.event_date,e.claim_date,e.payment_date,C.amount(e.amount),e.responsibility?.kind||'',e.responsibility?.employee_id||'',e.responsibility?.comment||'',e.claim.path+'/financial_events/'+e.id])]},
     {name:'Фильтры',rows:[['Параметр','Значение'],['Выгружено',new Date().toISOString()],['Данные загружены',now],...Object.entries(filters),['Даты','Активные: date; списанные: accountDate'],['Полнота истории','Только существующие записи; маркетплейс по тексту не угадывается']]}],`Удержания_${new Date().toISOString().slice(0,10)}.xlsx`);
   };
  }
  for(const id of ['from','to','employee','state','kind','marketplace','query','claimstatus','claimpvz','claimtype'])el(id).addEventListener(['query','claimpvz'].includes(id)?'input':'change',refresh);
  el('reload').onclick=()=>report(host,{client});refresh();
 }
 root.ClaimsWorkspace={workflow,report,esc,css};
})(globalThis);

;
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClaimsAdapters=api;})(globalThis,function(){
 'use strict';
 const ozonStatus={GRPC_CLAIM_STATUS_RESPONSE_REQUIRED:'Ожидает ответа',GRPC_CLAIM_STATUS_ON_REVIEW:'На рассмотрении',GRPC_CLAIM_STATUS_IN_PROGRESS:'На рассмотрении',GRPC_CLAIM_STATUS_WITHHOLDING:'Удержание'};
 function route(url){
  const u=new URL(url);let m;
  if(u.hostname==='turbo-pvz.ozon.ru'&&(m=u.pathname.match(/^\/claims\/claims\/detail\/([^/]+)\/([^/]+)\/?$/)))return {marketplace:'ozon',storeId:m[1],uuid:m[2]};
  if(u.hostname==='hubs.market.yandex.ru'&&(m=u.pathname.match(/^\/tpl-partner\/(\d+)\/claims\/(\d+)(?:\/claim)?\/?$/)))return {marketplace:'yandex',campaign:m[1],id:m[2]};
  if(u.hostname==='hubs.market.yandex.ru'&&(m=u.pathname.match(/^\/tpl-partner\/(\d+)\/support\/([a-zA-Z0-9-]+)\/?$/)))return {marketplace:'yandex',kind:'support',campaign:m[1],id:m[2]};
  if(u.hostname==='mail.yandex.ru'&&(m=u.hash.match(/^#\/message\/(\d+)/)))return {marketplace:'yandex',kind:'mail',account:u.searchParams.get('uid')||'default',id:m[1]};
  return null;
 }
 function ozon(d,url){
  if(!d.claimId)throw Error('Ответ Ozon не содержит номера претензии');
  const items=(d.items||[]).map(i=>({item_name:i.itemName||'',barcode:String(i.itemBarcode||''),item_id:String(i.itemId||''),status:i.status||'',container:i.containerName||''}));
  return {marketplace:'ozon',claim_id:String(d.claimId),claim_uuid:d.claimUuid||'',store_id:String(d.store?.storeId||''),pvz_code:d.store?.storeName||'',amount:d.money?Number(d.money.units||0)+Number(d.money.nanos||0)/1e9:null,reason_raw:d.claimType==='GRPC_CLAIM_TYPE_AGENT_RETURNS'?'Невозврат: Не отправили предмет':d.claimReason||d.claimType||'',marketplace_status:d.claimStatus||'',ozon_status:ozonStatus[d.claimStatus]||d.claimStatus||'',claim_date:d.createdAt||'',deadline_at:d.expirationDate||'',claim_url:url,source_url:url,items,item_barcode:items[0]?.barcode||'',item_barcodes:items.map(i=>i.barcode).filter(Boolean),item_name:items.map(i=>i.item_name).filter(Boolean).join('; ')};
 }
 function yandex(d,campaign,url){
  if(!d.ticket||!d.id)throw Error('Ответ Яндекса не содержит ID и номера обращения');
  return {marketplace:'yandex',claim_id:String(d.ticket),source_claim_id:String(d.id),campaign_id:String(campaign),pvz_address:d.address||'',amount:d.cost??null,reason_raw:d.subject||'',marketplace_status:d.status||'',claim_date:d.creationDate||'',claim_url:url,source_url:url,item_barcode:String(d.barcode||''),item_barcodes:(d.barcodes||[d.barcode]).filter(Boolean).map(String)};
 }
 async function json(url,options){const r=await fetch(url,{credentials:'include',...options});if([401,403].includes(r.status))throw Error('Требуется вход в кабинет');if(!r.ok)throw Error('Кабинет: HTTP '+r.status);return r.json();}
 async function collect(url=location.href){
  const r=route(url);if(!r)throw Error('Откройте отдельную карточку претензии');
  if(r.marketplace==='ozon'){
   let token;try{token=JSON.parse(localStorage.getItem('pvz-access-token')||'{}').access_token;}catch{}
   if(!token)throw Error('Войдите в Турбо ПВЗ');
   const d=await json('/p-api/claims/Claims/GetClaimDetails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({claimUuid:r.uuid,storeId:r.storeId})});return ozon(d,url);
  }
  if(r.kind==='support'||r.kind==='mail')return yandexText(readText(document,r.kind),r,url);
  const base='/api/partner-gateway/'+r.campaign+'/claims/';let found;
  for(const tab of ['WAIT','CHECK','PAY','ARCHIVE']){
   for(let page=1;page<=200;page++){
    const d=await json(base+`get-claims?tab=${tab}&pageSize=50&pageNumber=${page}`);
    found=(d.content||[]).find(x=>String(x.id)===r.id);if(found)break;
    if(d.last!==false||(d.content||[]).length===0)break;
    if(page===200)throw Error('Слишком много страниц претензий. Сбор остановлен без сохранения.');
   }if(found)break;
  }
  if(!found)throw Error('Открытая претензия не найдена в списках кабинета');
  const n=yandex(found,r.campaign,url);
  try{const comm=await json(base+'get-communication?claimId='+r.id);n.marketplace_messages=(comm.communication||[]).map(m=>({text:m.message||m.text||m.content||'',date:m.creationDate||m.date||''}));}catch(e){n.communication_error=e.message;}
  return n;
 }
 function readText(doc,kind){
  const selectors=kind==='mail'?['.mail-Message-Body-Content','[data-testid="message-body"]','.mail-Message-Body','.message-body']:['main','[role="main"]','article'];
  for(const selector of selectors){const nodes=[...doc.querySelectorAll(selector)].filter(n=>n.getClientRects().length);if(nodes.length)return nodes.map(n=>n.innerText||n.textContent||'').join('\n').trim();}
  return kind==='mail'?'':doc.body?.innerText||'';
 }
 function isYandexMail(text){return /яндекс|yandex|YMC-\d+/i.test(text||'');}
 function yandexText(text,r,url){
  if(r.kind==='mail'&&!isYandexMail(text))throw Error('В тексте открытого письма нет упоминания Яндекса');
  const line=labels=>{const m=text.match(new RegExp('(?:^|\\n)(?:'+labels+')\\s*[:：]?\\s*([^\\n]+)','i'));return m?m[1].trim():'';};
  const sum=text.match(/(?:сумма|удержание|стоимость)[^\d\n]{0,25}([\d \u00a0\u202f]+(?:[.,]\d{1,2})?)\s*(?:₽|руб)/i);
  const dm=(line('Создана|Дата обращения|Дата претензии|Дата')||'').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  const order=(text.match(/(?:заказ|грузоместо|отправление|штрихкод)\s*(?:№|:|#)?\s*([A-Za-zА-Яа-я0-9_-]{6,})/i)||[])[1]||'';
  const ticket=(text.match(/\bYMC-\d+\b/)||[])[0]||'';
  return {marketplace:'yandex',claim_id:r.kind==='mail'?`mail-${r.account}-${r.id}`:`support-${r.id}`,source_claim_id:r.id,source_kind:r.kind,campaign_id:r.campaign||'',linked_claim_id:ticket,reason_raw:line('Тема|Причина')||text.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,2).join(' · '),amount:sum?Number(sum[1].replace(/[ \u00a0\u202f]/g,'').replace(',','.')):null,pvz_address:line('Адрес ПВЗ|ПВЗ'),claim_date:dm?`${dm[3]}-${dm[2]}-${dm[1]}`:'',marketplace_status:line('Статус'),order_reference:order,item_barcode:order,item_barcodes:order?[order]:[],claim_url:url,source_url:url,source_text:text.slice(0,24000)};
 }
 function yandexHistoryUrl(outlet,number){
  if(!/^\d+$/.test(String(outlet)))throw Error('Некорректный кабинет ПВЗ');
  if(!String(number||'').trim())throw Error('Укажите заказ или грузоместо');
  return 'https://hubs.market.yandex.ru/tpl-outlet/'+outlet+'/sortables-and-orders?number='+encodeURIComponent(String(number))+'&statuses=';
 }
 function historyLink(doc,claim){
  if(claim.marketplace==='ozon'){
   const barcode=claim.item_barcode||(claim.item_barcodes||[]).find(Boolean);
   return barcode?'https://turbo-pvz.ozon.ru/search?filter='+encodeURIComponent(JSON.stringify({search:String(barcode)})):'';
  }
  const ids=[...(claim.item_barcodes||[]),claim.item_barcode,claim.order_reference].filter(Boolean).map(String);
  const links=[...doc.querySelectorAll('a[href]')].filter(a=>{
   let u;try{u=new URL(a.href,location.origin);}catch{return false;}
   if(u.origin!==location.origin)return false;
   return !u.pathname.includes('/claims/')&&ids.some(id=>(a.textContent||'').includes(id)||decodeURIComponent(u.href).includes(id));
  });
  return links.find(a=>/sortables-and-orders|item|search|order/i.test(a.href))?.href||'';
 }
 return {route,ozon,yandex,collect,historyLink,isYandexMail,yandexText,readText,yandexHistoryUrl};
});

;
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClaimsHistory=api;})(globalThis,function(){
 'use strict';
 const allowedHosts=new Set(['hubs.market.yandex.ru','turbo-pvz.ozon.ru']);
 const secret=/token|cookie|authorization|password|secret|csrf|phone|email|recipient|address/i;
 function requestInfo(url){
  let u;try{u=new URL(url);}catch{return null;}
  if(!allowedHosts.has(u.hostname)||!/^\/(api\/|p-api\/)/.test(u.pathname)||/auth|token|login|session|profile|account/i.test(u.pathname))return null;
  if(u.hostname!=='turbo-pvz.ozon.ru'&&!/histor|event|track|movement|sortable|order|item|search/i.test(u.pathname))return null;
  const ids=[];let redacted=false;for(const [k,v] of [...u.searchParams]){
   if(secret.test(k)||!/^(?:\w*(?:id|number|barcode)|search|filter|page\w*|limit|offset|status\w*)$/i.test(k)){u.searchParams.delete(k);redacted=true;}
   else if(v.length>500||secret.test(v)){u.searchParams.set(k,'[omitted]');redacted=true;}
   else if(/number|barcode|search/i.test(k))ids.push(v);
  }
  return {url:u.href,path:u.pathname,ids,redacted};
 }
 function schema(data,depth=0){if(depth>4)return '…';if(Array.isArray(data))return data.length?[schema(data[0],depth+1)]:[];if(data&&typeof data==='object')return Object.fromEntries(Object.entries(data).filter(([k])=>!secret.test(k)).slice(0,50).map(([k,v])=>[k,schema(v,depth+1)]));return typeof data;}
 function extract(data){
  const out=[];
  function walk(v,depth,inHistory){
   if(depth>10||out.length>=400||!v||typeof v!=='object')return;
   if(Array.isArray(v)){v.slice(0,500).forEach(x=>walk(x,depth+1,inHistory));return;}
   const date=v.statusUpdateAt||v.date||v.timestamp||v.eventDate||v.datetime||v.createdAt||v.created_at;
   const status=v.statusName||v.statusDescription||v.eventName||v.description||v.status||v.event;
   const cell=v.cellName||v.cell?.name||(typeof v.cell==='string'?v.cell:'');
   if(inHistory&&date&&(typeof status==='string'))out.push({date:String(date),status,details:[cell&&'Ячейка: '+cell,v.locationName].filter(x=>typeof x==='string').join(' · ')});
   for(const [k,x] of Object.entries(v))if(!secret.test(k))walk(x,depth+1,inHistory||/histor|events|tracking|movement/i.test(k));
  }
  walk(data,0,false);return [...new Map(out.map(e=>[JSON.stringify(e),e])).values()];
 }
 function parseText(text){
  const lines=String(text||'').split('\n').map(x=>x.trim()).filter(Boolean),rows=[];
  for(let i=0;i<lines.length;i++){
   const m=lines[i].match(/^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})(?:\s*[•·]\s*(.*))?$/);
   if(m&&lines[i+1]&&!/^\d{2}\.\d{2}\.\d{4}/.test(lines[i+1]))rows.push({date:m[1]+' '+m[2],status:lines[i+1],details:m[3]||''});
  }return rows;
 }
 function identifiers(data){const ids=new Set();function walk(v,d){if(d>8||!v||typeof v!=='object')return;if(Array.isArray(v)){v.slice(0,200).forEach(x=>walk(x,d+1));return;}for(const [k,x]of Object.entries(v)){if(secret.test(k))continue;if(/^(barcode|orderNumber|externalId|sortableId|orderId|parcelNumber|number)$/i.test(k)&&['string','number'].includes(typeof x))ids.add(String(x));else if(typeof x==='object')walk(x,d+1);}}walk(data,0);return [...ids].slice(0,100);}
 function entities(data){
  const out=[];function walk(v,d){if(d>7||!v||typeof v!=='object')return;if(Array.isArray(v)){v.slice(0,200).forEach(x=>walk(x,d+1));return;}
   if(v.cargoId!==undefined&&/^\d+$/.test(String(v.cargoId))){const barcodes=[...new Set([v.primaryBarcode,v.secondaryBarcode].filter(x=>typeof x==='string'&&x))];if(barcodes.length)out.push({cargoId:String(v.cargoId),barcodes});}
   for(const [k,x]of Object.entries(v))if(!secret.test(k)&&typeof x==='object')walk(x,d+1);
  }walk(data,0);return [...new Map(out.map(e=>[e.cargoId,e])).values()];
 }
 function installCapture(win,onRecord){
  if(win.__pvzHistoryCapture)return;win.__pvzHistoryCapture=true;
  function capture(url,method,data,sourcePage,body){const info=requestInfo(url);if(!info)return;const events=extract(data);const record={...info,method,sourcePage,events,entities:entities(data),identifiers:identifiers(data),schema:schema(data),at:new Date().toISOString()};
   if(/\/article-tracking\/Entity\/Find$|\/sortables-and-orders\/get-list$/.test(info.path)){
    function sanitize(v,d=0){if(d>6)return '[omitted]';if(Array.isArray(v))return v.slice(0,100).map(x=>sanitize(x,d+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!secret.test(k)).slice(0,50).map(([k,x])=>[k,sanitize(x,d+1)]));return typeof v==='string'?(secret.test(v)?'[redacted]':v.slice(0,500)):v;}
    try{if(typeof body==='string'&&body.length<20000)record.request_body=sanitize(JSON.parse(body));}catch{}
    if(data.entity)record.lookup_entity=Object.fromEntries(['id','entityType','entitySubType','entitySubTypeName'].filter(k=>typeof data.entity[k]==='string').map(k=>[k,data.entity[k].slice(0,300)]));
   }
   onRecord(record);
  }
  const original=win.fetch;
  win.fetch=function(...args){const sourcePage=win.location.origin+win.location.pathname;const pending=Reflect.apply(original,this,args);pending.then(r=>{const url=r.url||String(args[0]?.url||args[0]);if(!requestInfo(url)||!r.ok||!String(r.headers.get('content-type')).includes('json'))return;const length=Number(r.headers.get('content-length')||0);if(length>2000000)return;r.clone().text().then(t=>{if(t.length<=2000000)try{capture(url,args[1]?.method||args[0]?.method||'GET',JSON.parse(t),sourcePage,args[1]?.body);}catch{}}).catch(()=>{});}).catch(()=>{});return pending;};
  const proto=win.XMLHttpRequest?.prototype;if(proto){const open=proto.open,send=proto.send;
   proto.open=function(method,url,...rest){this.__pvzRead={method,url:new URL(String(url),win.location.href).href,sourcePage:win.location.origin+win.location.pathname};return Reflect.apply(open,this,[method,url,...rest]);};
   proto.send=function(...args){this.addEventListener('load',()=>{const req=this.__pvzRead;if(!req||!requestInfo(req.url)||this.status<200||this.status>=300)return;try{const data=this.responseType==='json'?this.response:!this.responseType||this.responseType==='text'?JSON.parse(this.responseText):null;if(data)capture(req.url,req.method,data,req.sourcePage,args[0]);}catch{}},{once:true});return Reflect.apply(send,this,args);};
  }
 }
 return {requestInfo,schema,extract,parseText,identifiers,entities,installCapture};
});

;
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ClaimsDomHistory=api;})(globalThis,function(){
 'use strict';
 const heading=/^история(?:\s+(?:перемещени[йя]|отправления|предмета|операций|заказа|движения))?\s*$/i;
 const dateStart=/\b\d{1,2}[./]\d{1,2}[./]\d{4}(?:[,\s]+\d{1,2}:\d{2}(?::\d{2})?)?/;
 function identityMatches(text,ref){if(!ref)return false;const escaped=String(ref).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(^|[^a-zа-я0-9_-])'+escaped+'($|[^a-zа-я0-9_-])','i').test(text);}
 function extractText(text){
  const lines=String(text||'').split(/\n|\t/).map(s=>s.trim()).filter(Boolean);
  let start=lines.findIndex(s=>heading.test(s));
  if(start<0)start=lines.findIndex(s=>dateStart.test(s));
  if(start<0)return {text:'',events:[]};
  const selected=lines.slice(start,start+600),events=[];
  for(let i=0;i<selected.length;i++){
   const m=selected[i].match(dateStart);if(!m)continue;
   const tail=selected[i].slice(m.index+m[0].length).replace(/^[\s•·,|]+/,'');
   const details=[];let next=i+1;
   while(next<selected.length&&!dateStart.test(selected[next])&&details.length<12){details.push(selected[next]);next++;}
   const status=tail||details.shift()||'';if(status)events.push({date:m[0],status,details:details.join(' · ')});
   i=next-1;
  }
  return {text:selected.join('\n').slice(0,30000),events};
 }
 function readPage(doc,ref,{confirmed=false}={}){
  const candidates=[...doc.querySelectorAll('main,[role="main"],article')].filter(n=>n.getClientRects().length);
  if(!candidates.length)candidates.push(doc.body);
  for(const node of candidates){
   // Read rendered text, excluding the assistant's own UI and all script/style source.
   const excluded=[...node.querySelectorAll('#pvz-claims-assistant,#pvz-history-tools,#pvz-ozon-dom-tools,script,style,noscript')];
   const chunks=[];
   const walk=doc.createTreeWalker(node,4);
   while(walk.nextNode()){
    const t=walk.currentNode;if(excluded.some(e=>e.contains(t)))continue;
    const parent=t.parentElement;if(!parent||!parent.getClientRects().length)continue;
    const style=doc.defaultView.getComputedStyle(parent);if(style.visibility==='hidden'||style.display==='none')continue;
    chunks.push(t.textContent);
   }
   const text=chunks.join('\n');if(!confirmed&&!identityMatches(text,ref))continue;
   const result=extractText(text);if(result.text)return result;
  }return null;
 }
 return {identityMatches,extractText,readPage};
});

;
/* Validated routes from pvz-history-diagnostic (1).json; not an inferred parcel mapping. */
globalThis.ClaimsObservedHistory=[{outlet:'148846298',cargoId:'20000920812458'}];

;
/* Runs before the page scripts: observes read responses, never sends marketplace commands. */
(function(root){
 'use strict';
 const H=root.ClaimsHistory,key='pvz_history_records_v1',diagnosticKey='pvz_diagnostic_until';
 const read=()=>GM_getValue(key,[]);
 function record(r){
  r.outlet=(String(r.sourcePage||'').match(/\/tpl-outlet\/(\d+)/)||[])[1]||'';
  const diagnostic=Date.now()<GM_getValue(diagnosticKey,0);
  if(!r.events.length&&!r.entities?.length&&!r.text&&!diagnostic)return;
  if(!diagnostic)delete r.schema;
  const records=read().filter(x=>x.url!==r.url||x.outlet!==r.outlet);records.push(r);GM_setValue(key,records.slice(-60));
 }
 try{H.installCapture(typeof unsafeWindow==='undefined'?window:unsafeWindow,record);}catch(e){console.warn('ПВЗ: диагностика запросов не подключилась',e.message);}
 function hostFor(marketplace){return marketplace==='ozon'?'turbo-pvz.ozon.ru':'hubs.market.yandex.ru';}
 function sameScope(r,outlet,marketplace){try{return new URL(r.url).hostname===hostFor(marketplace)&&(!outlet||r.outlet===outlet);}catch{return false;}}
 function matching(ref,outlet,marketplace){return read().filter(r=>r.events?.length&&sameScope(r,outlet,marketplace)&&(!r.identifiers?.length||r.identifiers.length===1&&r.identifiers[0]===ref)&&((r.ids||[]).includes(ref)||(r.identifiers||[]).length===1&&r.identifiers[0]===ref)).sort((a,b)=>b.at.localeCompare(a.at));}
 function getJson(url){return new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'GET',url,timeout:20000,onload:r=>{if(r.status!==200){reject(Error('История: HTTP '+r.status));return;}try{resolve(JSON.parse(r.responseText));}catch{reject(Error('Кабинет вернул не JSON. Проверьте вход в Яндекс.'));}},onerror:()=>reject(Error('История: ошибка соединения')),ontimeout:()=>reject(Error('История: время ожидания истекло'))}));}
 async function yandexHistory(ref,outlet){
  if(!/^\d+$/.test(outlet||''))return null;
  const candidates=new Set();
  for(const r of read().filter(r=>sameScope(r,outlet,'yandex'))){
   for(const e of r.entities||[])if(e.barcodes?.includes(ref))candidates.add(String(e.cargoId));
   if(!r.entities?.length){try{const u=new URL(r.url);if(u.pathname===`/api/gateway/logpoint/${outlet}/sortables-and-orders/get-sortable`||u.pathname===`/api/gateway/logpoint/${outlet}/sortables-and-orders/get-status-history`){const id=u.searchParams.get('cargoId');if(/^\d+$/.test(id||''))candidates.add(id);}}catch{}}
  }
  // Actual GET observed in the supplied diagnostic; every response is checked against the requested barcode.
  const observed=root.ClaimsObservedHistory||[];for(const item of observed)if(item.outlet===outlet)candidates.add(item.cargoId);
  const base=`https://hubs.market.yandex.ru/api/gateway/logpoint/${outlet}/sortables-and-orders/`;
  for(const cargoId of [...candidates].slice(0,8)){
   const detail=await getJson(base+'get-sortable?cargoId='+encodeURIComponent(cargoId));
   const entity=H.entities(detail).find(e=>e.cargoId===cargoId&&e.barcodes.includes(ref));if(!entity)continue;
   const url=base+'get-status-history?cargoId='+encodeURIComponent(cargoId),data=await getJson(url);
   if(!H.entities(data.info||{}).some(e=>e.cargoId===cargoId&&e.barcodes.includes(ref)))throw Error('Ответ истории относится к другому грузоместу');
   const events=H.extract(data),at=new Date().toISOString();
   record({url,path:new URL(url).pathname,method:'GET',sourcePage:`https://hubs.market.yandex.ru/tpl-outlet/${outlet}/sortables-and-orders`,events,entities:[entity],identifiers:entity.barcodes,ids:[ref],at});
   return {events,source:url,at};
  }return null;
 }
 async function history(ref,outlet,marketplace){
  const dom=read().filter(r=>r.kind==='dom'&&r.ref===ref&&r.text&&sameScope(r,outlet,marketplace)).sort((a,b)=>b.at.localeCompare(a.at))[0];
  if(dom)return {kind:'dom',text:dom.text,events:dom.events,source:dom.url,at:dom.at};
  if(marketplace==='yandex'){const result=await yandexHistory(ref,outlet);if(result)return result;}
  const cached=matching(ref,outlet,marketplace)[0];if(cached)return {events:cached.events,source:cached.url,at:cached.at};
  const candidates=read().filter(r=>r.method.toUpperCase()==='GET'&&r.events?.length&&sameScope(r,outlet,marketplace)&&/histor|event|track|movement/i.test(r.path));
  for(const t of candidates.reverse()){
   const url=new URL(t.url);let replaced=false;
   if([...url.searchParams].some(([k])=>/id$/i.test(k)&&!/^campaignId$|^outletId$/i.test(k)))continue;
   if(url.pathname.split('/').filter(x=>/^\d+$/.test(x)).some(x=>x!==outlet))continue;
   for(const [k,v]of [...url.searchParams])if(/^(number|barcode|search|orderNumber|parcelNumber)$/i.test(k)&&t.ids.includes(v)){url.searchParams.set(k,ref);replaced=true;}
   if(!replaced||t.redacted)continue;
   const data=await new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'GET',url:url.href,timeout:20000,onload:r=>{if(r.status!==200){reject(Error('История: HTTP '+r.status));return;}try{resolve(JSON.parse(r.responseText));}catch{reject(Error('Кабинет вернул не данные истории. Проверьте вход.'));}},onerror:()=>reject(Error('История недоступна: ошибка соединения')),ontimeout:()=>reject(Error('История: время ожидания истекло'))}));
   const events=H.extract(data),ids=H.identifiers(data);if(ids.length!==1||ids[0]!==ref)throw Error('Принадлежность истории этому грузоместу не подтверждена. Нужна диагностика фактического API.');
   if(!events.length)throw Error('Ответ истории получен, но формат событий пока не распознан. Сохраните диагностику.');
   const result={...t,url:url.href,ids:[ref],identifiers:ids,events,at:new Date().toISOString()};record(result);return {events,source:url.href,at:result.at};
  }
  return null;
 }
 function download(){const records=read().map(({events,text,...r})=>({...r,event_count:events?.length||0,event_schema:H.schema(events?.[0]||{})}));const data={version:'1.0.5',exported_at:new Date().toISOString(),records};const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='pvz-history-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
 function storeDom(ref,url,result){if(!ref||!result?.text)return;record({kind:'dom',ref,url,path:new URL(url).pathname,sourcePage:url,events:result.events||[],text:result.text,ids:[ref],identifiers:[ref],method:'DOM',at:new Date().toISOString()});}
 root.ClaimsCapture={history,read,storeDom,start:()=>GM_setValue(diagnosticKey,Date.now()+5*60000),download};
})(globalThis);

;
(function(){
 'use strict';
 const C=ClaimsCore,W=ClaimsWorkspace,A=ClaimsAdapters;
 if(window.top!==window.self)return;
 // Вход управляющего: пароль спрашивается один раз, дальше хранится только токен обновления.
 const FB_KEY='AIzaSyDgpd51erVNy_PwSbYTXPISALNMmYtgTN8',TOKK='kz_admin_token';
 const gmPost=(url,body,form)=>new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'POST',url,headers:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'},data:body,anonymous:true,timeout:20000,onload:r=>resolve({status:r.status,json:(()=>{try{return JSON.parse(r.responseText)}catch(e){return {}}})()}),onerror:()=>reject(Error('Нет соединения с сервером входа')),ontimeout:()=>reject(Error('Сервер входа не ответил'))}));
 let tokBusy=null;
 async function adminToken(){
  let s=GM_getValue(TOKK,null);
  if(s&&s.exp>Date.now()+120000)return s.id;
  if(s&&s.refresh){const r=await gmPost('https://securetoken.googleapis.com/v1/token?key='+FB_KEY,'grant_type=refresh_token&refresh_token='+encodeURIComponent(s.refresh),true);
   if(r.status===200){s={id:r.json.id_token,refresh:r.json.refresh_token,exp:Date.now()+r.json.expires_in*1000};GM_setValue(TOKK,s);return s.id;}}
  const pw=prompt('Пароль управляющих Kozonko (спрашивается один раз на этом компьютере):');
  if(!pw)throw Error('Нужен вход: обновите страницу и введите пароль управляющих');
  const r=await gmPost('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+FB_KEY,JSON.stringify({email:'admin@kozonko.app',password:pw,returnSecureToken:true}));
  if(r.status!==200)throw Error('Неверный пароль управляющих');
  s={id:r.json.idToken,refresh:r.json.refreshToken,exp:Date.now()+r.json.expiresIn*1000};GM_setValue(TOKK,s);return s.id;
 }
 const withAuth=async url=>{if(url.indexOf(C.FB)!==0)return url;tokBusy=tokBusy||adminToken().finally(()=>{tokBusy=null});const t=await tokBusy;return url+(url.includes('?')?'&':'?')+'auth='+encodeURIComponent(t);};
 const client=C.createClient((url0,opt)=>withAuth(url0).then(url=>new Promise((resolve,reject)=>{
  GM_xmlhttpRequest({method:opt.method||'GET',url,headers:opt.headers||{},data:opt.body,anonymous:true,timeout:20000,onload:r=>resolve({status:r.status,text:r.responseText,etag:(r.responseHeaders.match(/^etag:\s*(.+)$/im)||[])[1]?.trim()}),onerror:()=>reject(Error('Нет соединения с Firebase')),ontimeout:()=>reject(Error('Firebase не ответила за 20 секунд'))});
 })));
 let currentUrl='',claim=null,path='',busy=false,serial=0,historySerial=0,host,shadow;
 function mount(){
  host=document.createElement('div');host.id='pvz-claims-assistant';host.style.cssText='position:fixed;'+(location.hostname==='turbo-pvz.ozon.ru'?'left:14px;bottom:14px;':'right:14px;top:65px;')+'width:min(650px,calc(100vw - 28px));max-height:88vh;z-index:2147483000;';
  shadow=host.attachShadow({mode:'open'});shadow.innerHTML=`<style>${W.css}.panel{background:white;border:1px solid #cbd2dc;border-radius:7px;box-shadow:0 4px 20px #0002}.head{padding:10px 14px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between;align-items:center}.body{padding:14px;max-height:76vh;overflow:auto}#summary{white-space:pre-wrap}#historymsg{font-size:12px;color:#686f7b}</style><div class="panel"><div class="head"><strong>Претензия · внутренняя панель</strong><button id="toggle">Свернуть</button></div><div class="body" id="body"><div class="row"><button id="collect">Обновить со страницы</button><button id="save" class="primary" disabled>Сохранить в систему</button></div><p id="message" role="status"></p><p id="summary"></p><div id="draft" class="grid"></div><h3>История заказа / предмета</h3><p id="historymsg"></p><div id="history"></div><details><summary>Связанные внутренние претензии</summary><div id="related"></div></details><div id="workflow"></div><details><summary>Диагностика истории</summary><p>Запросы кабинета читаются локально. Пароли, cookie и заголовки авторизации не экспортируются.</p><button id="diagstart">Записать диагностику на 5 минут</button> <button id="diagexport">Скачать диагностику</button><p id="diagmsg"></p></details></div></div>`;
  document.body.append(host);
  const el=id=>shadow.getElementById(id);
  el('toggle').onclick=()=>{const hide=el('body').hidden=!el('body').hidden;el('toggle').textContent=hide?'Развернуть':'Свернуть';host.style.width=hide?'300px':'min(650px,calc(100vw - 28px))';};
  el('collect').onclick=load;
  el('diagstart').onclick=()=>{ClaimsCapture.start();el('diagmsg').textContent='Диагностика включена на 5 минут. Один раз покажите историю грузоместа в штатном кабинете, затем скачайте диагностику. Панель сама не открывает страницы.';};
  el('diagexport').onclick=()=>ClaimsCapture.download();
  el('save').onclick=async()=>{
   if(busy||!claim)return;busy=true;el('save').disabled=true;
   const selected=claim,selectedPath=path,version=serial;
   try{await client.transact(selectedPath,old=>C.mergeCollected(old,selected,new Date().toISOString()));if(version!==serial)return;el('message').textContent='Сохранено в Firebase';await W.workflow(el('workflow'),selectedPath,{client});related();}
   catch(e){el('message').textContent=e.message;}finally{busy=false;el('save').disabled=!claim;}
  };
 }
 async function related(){
  const ids=new Set(claim?.item_barcodes||[]),version=serial;
  try{const data=await client.get('/claims');if(version!==serial)return;const rows=C.normalizeClaims(data).filter(r=>r.path!==path&&[r.data.item_barcode,...(r.data.item_barcodes||[])].some(x=>ids.has(x)));
   shadow.getElementById('related').textContent=rows.length?rows.map(r=>`${r.marketplace} ${r.id} · ${r.data.reason_raw||r.data.reason||''}`).join('\n'):'Совпадений по сохранённым штрихкодам нет.';
  }catch(e){shadow.getElementById('related').textContent=e.message;}
 }
 function outletList(){
  return {...GM_getValue('pvz_yandex_outlets',{}),'148846298':{id:'148846298',name:'Родионова'}};
 }
 function harvestCabinets(){
  const list=GM_getValue('pvz_yandex_outlets',{});
  for(const a of document.querySelectorAll('a[href]')){let u;try{u=new URL(a.href);}catch{continue;}const m=u.hostname==='hubs.market.yandex.ru'&&u.pathname.match(/\/tpl-outlet\/(\d+)/);if(m)list[m[1]]={id:m[1],name:(a.closest('tr')?.innerText||a.parentElement?.innerText||a.textContent||m[1]).trim().slice(0,240)};}
  GM_setValue('pvz_yandex_outlets',list);
 }
 function draft(n){
  const el=id=>shadow.getElementById(id);
  el('draft').innerHTML=[['pvz_address','ПВЗ / адрес',n.pvz_code||n.pvz_address||'','text'],['amount','Сумма, ₽',n.amount??'','number'],['claim_date','Дата претензии',C.date(n.claim_date),'date'],['marketplace_status','Статус маркетплейса',n.marketplace_status||n.ozon_status||'','text'],['reason_raw','Причина',n.reason_raw||'','text'],['order_reference','Заказ или штрихкод',n.order_reference||n.item_barcode||'','text']].map(([id,label,value,type])=>`<label>${label}<input data-field="${id}" type="${type}" value="${W.esc(value)}"${type==='number'?' min="0" step="0.01"':''}></label>`).join('');
  function sync(){if(claim!==n)return;for(const input of el('draft').querySelectorAll('[data-field]'))n[input.dataset.field]=input.dataset.field==='amount'?C.amount(input.value):input.value;
   n.item_barcode=n.order_reference;n.item_barcodes=[...new Set([n.order_reference,...(n.item_barcodes||[])].filter(Boolean))];
   try{C.validateCollected(n);el('save').disabled=false;el('message').textContent='Данные готовы к сохранению. Проверьте поля.';}catch(e){el('save').disabled=true;el('message').textContent=e.message+'. Дополните поля выше.';}
  }
  el('draft').oninput=sync;el('draft').onchange=()=>{sync();history();};sync();
 }
 async function history(){
  const selected=claim,version=serial,historyVersion=++historySerial,area=shadow.getElementById('history'),msg=shadow.getElementById('historymsg');area.replaceChildren();
  if(!selected)return;
  const ref=selected.order_reference||selected.item_barcode||(selected.item_barcodes||[])[0]||'';
  let outlet=selected.outlet_id||GM_getValue('pvz_outlet_map',{})[selected.pvz_address||selected.pvz_code||'']||'';
  if(selected.marketplace==='yandex'){
   const list=outletList();
   if(!outlet&&/родионова/i.test(selected.pvz_address||''))outlet='148846298';
   const label=document.createElement('label');label.textContent='Кабинет ПВЗ для истории';const select=document.createElement('select');select.innerHTML='<option value="">Выберите ПВЗ</option>'+Object.values(list).map(o=>`<option value="${W.esc(o.id)}"${o.id===outlet?' selected':''}>${W.esc(o.name)}</option>`).join('');label.append(select);area.append(label);
   const hint=document.createElement('p');hint.textContent='Список кабинетов: logistics.market.yandex.ru/common/cabinets. Скрипт запоминает ссылки ПВЗ при посещении этой страницы.';area.append(hint);
   select.onchange=()=>{selected.outlet_id=select.value;const mapping=GM_getValue('pvz_outlet_map',{}),key=selected.pvz_address||selected.pvz_code;if(key){mapping[key]=select.value;GM_setValue('pvz_outlet_map',mapping);}history();};
   if(!outlet){msg.textContent='Выберите кабинет нужного ПВЗ. Страницы истории не открываются.';return;}selected.outlet_id=outlet;
  }
  if(!ref){msg.textContent='Укажите заказ или штрихкод в полях карточки.';return;}
  msg.textContent='Получаю текстовую историю…';
  try{
   const result=await ClaimsCapture.history(ref,outlet,selected.marketplace);
   if(version!==serial||historyVersion!==historySerial||claim!==selected)return;
   if(!result){msg.textContent=selected.marketplace==='yandex'?'Не найден внутренний cargoId этого заказа. Обновите список «Грузоместа и заказы» в нужном ПВЗ и найдите там заказ. После этого нажмите «Обновить со страницы» в панели. Запрос истории Яндекса уже подключён, повторная диагностика не нужна.':'Пока нет сохранённого текста истории этого штрихкода. На уже открытой странице поиска Ozon нажмите «Прочитать историю со страницы». Затем вернитесь к претензии и нажмите «Обновить со страницы». Вкладки и окна панель не открывает.';return;}
   msg.textContent=`Грузоместо / заказ ${ref}. Данные получены ${new Date(result.at).toLocaleString('ru-RU')}.`;
   if(result.kind==='dom'){msg.textContent+=' Источник — видимый текст страницы.';const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;font:inherit;line-height:1.6;max-height:480px;overflow:auto';pre.textContent=result.text;area.append(pre);return;}
   if(!result.events.length){msg.textContent+=' История перемещения пуста.';return;}
   const list=document.createElement('ol');for(const row of result.events){const li=document.createElement('li');const title=document.createElement('strong');const d=new Date(row.date);const dateLabel=/^\d{4}-/.test(row.date)&&!isNaN(d)?d.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':row.date;title.textContent=dateLabel+' — '+row.status;li.append(title);if(row.details){const p=document.createElement('p');p.textContent=row.details;li.append(p);}list.append(li);}area.append(list);
  }catch(e){if(version===serial)msg.textContent=e.message;}
 }
 async function load(){
  const version=++serial;claim=null;path='';const el=id=>shadow.getElementById(id);el('save').disabled=true;el('collect').disabled=true;el('workflow').replaceChildren();el('history').replaceChildren();el('related').textContent='';el('message').textContent='Получаю данные открытой претензии…';
  try{const n=await A.collect(location.href);if(version!==serial)return;claim=n;path=n.marketplace==='ozon'?'/claims/'+C.cleanId(n.claim_id):'/claims/yandex/active/'+C.cleanId(n.claim_id);
   el('summary').textContent=`${n.marketplace==='ozon'?'Ozon':'Яндекс Маркет'} · ${n.claim_id}\nПВЗ: ${n.pvz_code||n.pvz_address||'не указан'}\nСумма: ${n.amount??'не указана'} ₽\nПричина: ${n.reason_raw||'не указана'}\nШтрихкоды: ${(n.item_barcodes||[]).join(', ')||'не указаны'}`;
   el('message').textContent=n.communication_error?'Данные получены; переписка недоступна: '+n.communication_error:'Данные получены. Нажмите «Сохранить в систему» для записи.';draft(n);history();
   const old=await client.get(path);if(version===serial&&old)await W.workflow(el('workflow'),path,{client});related();
  }catch(e){if(version===serial){el('message').textContent=e.message;el('summary').textContent='';}}finally{if(version===serial)el('collect').disabled=false;}
 }
 let lastDomKey='',pendingDomKey='';
 function readOzonPage(){
  if(location.hostname!=='turbo-pvz.ozon.ru'||location.pathname!=='/search'){document.getElementById('pvz-ozon-dom-tools')?.remove();lastDomKey='';pendingDomKey='';return;}
  let ref='';try{ref=String(JSON.parse(new URL(location.href).searchParams.get('filter')||'{}').search||'');}catch{}
  let tools=document.getElementById('pvz-ozon-dom-tools');
  if(!tools){
   tools=document.createElement('div');tools.id='pvz-ozon-dom-tools';tools.style.cssText='position:fixed;bottom:12px;left:12px;z-index:2147483000;background:white;color:#222;border:1px solid #bbb;border-radius:6px;padding:10px;font:13px sans-serif;max-width:500px';
   const button=document.createElement('button');button.textContent='Прочитать историю со страницы';const status=document.createElement('span');status.id='pvz-ozon-dom-status';status.style.marginLeft='8px';
   button.onclick=()=>read(true);tools.append(button,status);document.body.append(tools);
  }
  function read(confirmed){
   const status=document.getElementById('pvz-ozon-dom-status');
   if(!ref){status.textContent='Штрихкод отсутствует в фильтре поиска.';return;}
   const result=ClaimsDomHistory.readPage(document,ref,{confirmed});
   if(!result||result.text.split('\n').length<3){if(confirmed)status.textContent='Раздел истории пока не распознан в видимом тексте.';return;}
   const key=ref+'|'+result.text;
   if(!confirmed&&key!==pendingDomKey){pendingDomKey=key;return;}
   if(key!==lastDomKey){ClaimsCapture.storeDom(ref,location.origin+location.pathname+'?filter='+encodeURIComponent(JSON.stringify({search:ref})),result);lastDomKey=key;}
   status.textContent='Текст истории для '+ref+' сохранён. Вернитесь к претензии.';
  }
  tools.querySelector('button').onclick=()=>read(true);
  read(false);
 }
 function tick(){
  readOzonPage();
  if(location.hostname==='logistics.market.yandex.ru'){harvestCabinets();return;}
  if(location.hostname==='hubs.market.yandex.ru'&&/^\/tpl-outlet\/\d+\/sortables-and-orders/.test(location.pathname)){
   if(!document.getElementById('pvz-history-tools')){
    const tools=document.createElement('div');tools.id='pvz-history-tools';tools.style.cssText='position:fixed;bottom:12px;left:12px;z-index:2147483000;background:white;border:1px solid #ccc;border-radius:6px;padding:8px;font:12px sans-serif;color:#222';
    const status=document.createElement('span');status.textContent='ПВЗ · история ';const start=document.createElement('button');start.textContent='Записать диагностику';start.onclick=()=>{ClaimsCapture.start();status.textContent='Запись включена на 5 минут. Покажите историю посылки. ';};const download=document.createElement('button');download.textContent='Скачать диагностику';download.onclick=()=>ClaimsCapture.download();tools.append(status,start,download);document.body.append(tools);
   }
  }else document.getElementById('pvz-history-tools')?.remove();
  const r=A.route(location.href);const text=r&&(r.kind==='mail'||r.kind==='support')?A.readText(document,r.kind):'';
  const key=location.href+'|'+text.length+'|'+text.slice(0,400);
  if(key===currentUrl)return;currentUrl=key;serial++;
  if(!r||(r.kind==='mail'&&!A.isYandexMail(text))){if(host)host.hidden=true;return;}
  if(!host)mount();host.hidden=false;load();
 }
 const start=()=>{tick();setInterval(tick,1000);};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
