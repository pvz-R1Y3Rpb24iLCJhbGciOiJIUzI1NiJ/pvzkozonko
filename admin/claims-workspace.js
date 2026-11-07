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
