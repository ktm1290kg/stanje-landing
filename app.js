let initial=null, stavke=[], aktivnaStavka=0, role='worker', kursEur=117.5, currentDays=1;

// ═══════════ UNIVERZALNA ZAŠTITA OD DVOSTRUKOG KLIKA ═══════════
// Nijedno dugme ne prima drugi klik u roku od 1,2 sekunde.
// Hvata se u "capture" fazi, pre nego što onclick uopšte krene.
addEventListener('click', function(e){
  const btn = e.target.closest('button, .gbtn, .stab, .tab, .link');
  if(!btn) return;
  if(btn.dataset.zauzeto === '1'){
    e.preventDefault();
    e.stopImmediatePropagation();
    return false;
  }
  btn.dataset.zauzeto = '1';
  const stariOpacity = btn.style.opacity;
  btn.style.opacity = '0.6';
  setTimeout(function(){
    btn.dataset.zauzeto = '';
    btn.style.opacity = stariOpacity;
  }, 1200);
}, true);


const $=id=>document.getElementById(id);
const val=id=>{const e=$(id);return e?e.value:''};
const setVal=(id,v)=>{const e=$(id);if(e)e.value=(v===null||v===undefined?'':v)};
const numOrNull=id=>val(id)===''?null:Number(String(val(id)).replace(/\./g,'').replace(',','.'));
function status(id,text,cls){
  const e=$(id);if(e){e.className='status '+cls;e.textContent=text;e.style.display='block'}
  // svaka greška dobija i pop-up — da se neuspeh nikad ne previdi
  if(cls==='error'&&typeof toast==='function')toast('Nije uspelo',text,'err');
}
function hideStatus(id){const e=$(id);if(e)e.style.display='none'}

// ---------- FORMATIRANJE BROJEVA (1.234.567,89) ----------
function fmt(n){
  if(n===null||n===undefined||n==='')return '';
  const br=Number(n);
  if(isNaN(br))return '';
  return br.toLocaleString('sr-RS',{maximumFractionDigits:2});
}
function fmtCela(n){
  if(n===null||n===undefined||n==='')return '';
  const br=Number(n);
  if(isNaN(br))return '';
  return Math.round(br).toLocaleString('sr-RS');
}
// Formatira polje dok korisnik kuca (za cene)
function formatirajPolje(el){
  const cist=String(el.value).replace(/\./g,'').replace(',','.');
  if(cist===''||isNaN(Number(cist)))return;
  const kraj=el.selectionStart===el.value.length;
  el.value=fmt(Number(cist));
  if(kraj)el.setSelectionRange(el.value.length,el.value.length);
}

// Preslovljavanje ćirilica → latinica (backend poruke stižu ćirilicom; UI je latinica)
const _C2L={'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Ђ':'Đ','Е':'E','Ж':'Ž','З':'Z','И':'I','Ј':'J','К':'K','Л':'L','Љ':'Lj','М':'M','Н':'N','Њ':'Nj','О':'O','П':'P','Р':'R','С':'S','Т':'T','Ћ':'Ć','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Č','Џ':'Dž','Ш':'Š','а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'đ','е':'e','ж':'ž','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'ć','у':'u','ф':'f','х':'h','ц':'c','ч':'č','џ':'dž','ш':'š'};
function cir2lat(s){ return String(s==null?'':s).replace(/[Ѐ-ӿ]/g,ch=>_C2L[ch]??ch); }
// srpska množina: 1 prodaja, 2–4 prodaje, 5+ prodaja (11–14 uvek 'prodaja')
function prodajaRec(n){ n=Math.abs(Number(n)||0); const m100=n%100, m10=n%10; if(m100>=11&&m100<=14) return 'prodaja'; if(m10===1) return 'prodaja'; if(m10>=2&&m10<=4) return 'prodaje'; return 'prodaja'; }

async function api(path,options={}){
  const r=await fetch(path,options);
  const j=await r.json();
  if(!r.ok||j.ok===false){
    const poruka=cir2lat(j.error||'Greška servera');
    // Istekla/nevažeća sesija → nazad na prijavu (ne prikazuj tehničku grešku)
    if(/SESIJA_ISTEKLA/.test(poruka)){localStorage.removeItem('predatorPin');location.reload();return;}
    throw new Error(poruka);
  }
  const rez=j.result??j;
  if(rez&&typeof rez.message==='string')rez.message=cir2lat(rez.message);
  return rez;
}

// ---------- IDEMPOTENCY: retry ne pravi duplikat, nova prodaja pravi nov red ----------
const _idemKljucevi={};
function idemKljuc(slot){
  if(!_idemKljucevi[slot]){
    _idemKljucevi[slot]=(self.crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  }
  return _idemKljucevi[slot];
}
function idemGotovo(slot){ delete _idemKljucevi[slot]; }

// ---------- LOGIN ----------
async function login(){
  status('loginStatus','Učitavanje...','warn');
  try{
    initial=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'initial',pin:val('pin')})});
    role=initial.role||'worker';
    kursEur=initial.kursEur||117.5;
    // Čuvamo TOKEN (ne sirov PIN). Ako backend ne izda token (stari) — čuvamo PIN (kompatibilnost).
    localStorage.setItem('predatorPin',initial.token||val('pin'));
    localStorage.setItem('predatorUser',initial.ime||'Radnik');
    buildSelects();
    applyRole();
    $('loginCard').classList.add('hidden');
    $('main').classList.remove('hidden');
    hideStatus('loginStatus');
    setGreeting();
    loadHistory();
  }catch(e){status('loginStatus',e.message,'error')}
}

function logout(){
  const kred=localStorage.getItem('predatorPin');
  localStorage.removeItem('predatorPin');
  // Best-effort poništavanje sesije na serveru (ne čekamo odgovor).
  try{fetch('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'odjava',pin:kred})});}catch(e){}
  location.reload();
}

// Osveži sve (proizvodi, kurs, liste, istorija) bez ponovnog logovanja
async function osveziApp(btn){
  if(btn)btn.classList.add('spin');
  try{
    const pin=localStorage.getItem('predatorPin');
    if(pin){
      initial=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'initial',pin})});
      role=initial.role||'worker';
      kursEur=initial.kursEur||117.5;
      buildSelects(); applyRole(); setGreeting();
    }
    await loadHistory();
  }catch(e){status('dashStatus',e.message,'error')}
  if(btn)setTimeout(()=>btn.classList.remove('spin'),600);
}

function setGreeting(){
  const ime=(initial&&initial.ime)||localStorage.getItem('predatorUser')||'korisnik';
  const av=$('avatar');
  if(av){
    av.textContent=(ime.trim()[0]||'?').toUpperCase();
    av.className='avatar'+(role==='owner'?' owner':'');
  }
  const dani=['nedelja','ponedeljak','utorak','sreda','četvrtak','petak','subota'];
  const d=new Date();
  $('greeting').textContent='Ćao, '+ime+' · '+dani[d.getDay()]+', '+
    String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.';
}

function applyRole(){
  document.querySelectorAll('[data-owner]').forEach(el=>{
    if(role==='owner')el.classList.remove('hidden');else el.classList.add('hidden');
  });
  // Ove kartice otvara dugme, ne uloga — uvek kreću zatvorene.
  zatvoriSveKartice();
}

// ---------- KARTICE: jedna otvorena, dugme radi kao prekidač ----------
const SVE_KARTICE=['brziUnos','potvrdaCard','ispravkaCard','troskoviUnos','trosakCard',
  'reklamacijaCard','pregledCard','povratCard','kaparaCard','izmenaReklCard','stanjeCard','artikalCard','podesavanjaCard',
  'racuniCard','skenCard','racunPregledCard','posaljiCard','pomocCard'];

// Svaka sekcija se otvara kao CELA STRANICA sa „← Početna" zaglavljem
const PAGE_META={
  brziUnos:       {ico:'ti-layout-grid',  n:'Brzi unos',        s:'Nova prodaja'},
  potvrdaCard:    {ico:'ti-layout-grid',  n:'Brzi unos',        s:'Potvrdi prodaju'},
  ispravkaCard:   {ico:'ti-pencil',       n:'Ispravka unosa',   s:'Izmeni ili obriši'},
  troskoviUnos:   {ico:'ti-receipt',      n:'Trošak / uplata',  s:'Izaberi vrstu'},
  trosakCard:     {ico:'ti-receipt',      n:'Trošak / uplata',  s:'Unos troška'},
  reklamacijaCard:{ico:'ti-tool',         n:'Reklamacija',      s:'Kvar i troškovi popravke'},
  pregledCard:    {ico:'ti-chart-donut',  n:'Pregled meseca',   s:'Promet, zarada, artikli'},
  povratCard:     {ico:'ti-arrow-back-up',n:'Povrat artikla',   s:'Kontrolisan povrat'},
  kaparaCard:     {ico:'ti-cash',         n:'Kapare',           s:'Rezervisani artikli'},
  izmenaReklCard: {ico:'ti-tool',         n:'Izmena reklamacije',s:''},
  stanjeCard:     {ico:'ti-packages',     n:'Stanje lagera',    s:'Automatski ažurirano'},
  artikalCard:    {ico:'ti-plus',         n:'Novi artikal',     s:'Dodavanje u katalog'},
  podesavanjaCard:{ico:'ti-settings',     n:'Podešavanja',      s:'Firma, kurs, knjigovođa'},
  racuniCard:     {ico:'ti-receipt-2',    n:'Računi',           s:'Arhiva i slanje knjigovođi'},
  skenCard:       {ico:'ti-scan',         n:'Skeniraj račun',   s:'Sačuvaj i pošalji knjigovođi'},
  racunPregledCard:{ico:'ti-receipt-2',   n:'Račun',            s:'Pregled i akcije'},
  posaljiCard:    {ico:'ti-send',         n:'Slanje knjigovođi',s:'Pregled pre slanja'},
  pomocCard:      {ico:'ti-message-heart',n:'Pomoć i predlozi', s:'Piši nam — čitamo sve'}
};
function _pageHead(id){
  const e=$(id); if(!e||e.querySelector('.page-head'))return;
  const m=PAGE_META[id]||{ico:'ti-app-window',n:'',s:''};
  const h=document.createElement('div');
  h.className='page-head';
  h.innerHTML='<button class="ph-back" onclick="nazadNaPocetnu()"><i class="ti ti-chevron-left"></i> Početna</button>'+
    '<div class="ph-row"><span class="ph-ico"><i class="ti '+m.ico+'"></i></span>'+
    '<span><span class="ph-n">'+m.n+'</span>'+(m.s?'<span class="ph-s">'+m.s+'</span>':'')+'</span></div>';
  e.prepend(h);
}
function nazadNaPocetnu(){ zatvoriSveKartice(); window.scrollTo({top:0}); }
function prikaziKarticu(id){ zatvoriSveKartice(id); const e=$(id); if(e)e.classList.remove('hidden'); }
function otvoriPomoc(){ prikaziKarticu('pomocCard'); }
function zatvoriSveKartice(osim){
  if(osim!=='skenCard' && typeof stopKamera==='function')stopKamera();
  SVE_KARTICE.forEach(id=>{
    const e=$(id); if(!e)return;
    if(id===osim){ e.classList.add('page'); _pageHead(id); }
    else { e.classList.add('hidden'); e.classList.remove('page'); }
  });
  const m=$('main'); if(m)m.classList.toggle('view-open',!!osim);
  if(osim)window.scrollTo({top:0});
}
const karticaOtvorena=id=>{const e=$(id);return !!e && !e.classList.contains('hidden')};

// true = kartica je bila otvorena pa smo je zatvorili (prekidač)
function prekidacKartice(id){
  if(karticaOtvorena(id)){ zatvoriSveKartice(); return true; }
  zatvoriSveKartice(id);
  return false;
}

// Rezervne liste za reklamaciju (ako tabela vrati prazno).
const REZ_KVAR=['Motor','Elektrika','Prenos / kvačilo','Kočnice','Guma / točak',
  'Transportno oštećenje','Ostalo'];
const REZ_STATUS=['Otvorena','U toku','Rešena','Odbijena'];

// Rezervne liste: ako tabela vrati prazno, dugmad i padajući meniji i dalje rade.
const REZ_PLACANJA=['Gotovina','Kartica','Prenos na račun','Pouzećem'];
const REZ_KAT_TROSKA=['KupujemProdajem','Marketing / oglasi','Plata radnika',
  'Nabavka robe','Transport / carina','Poštarina','Alat i oprema','Gorivo',
  'Režije','Knjigovodstvo','Ostalo'];
const listaIli=(a,rez)=>(a&&a.length)?a:rez;

// Emodži po vrsti troška. Ako tabela vrati neku svoju kategoriju — dobija 📌.
const IKONE_TROSKA={'kupujemprodajem':'🛍️','marketing / oglasi':'📣','marketing':'📣',
  'plata radnika':'💰','plata':'💰','nabavka robe':'📦','nabavka':'📦','poštarina':'✉️',
  'postarina':'✉️','režije':'⚡','rezije':'⚡','gorivo':'⛽','carina i špedicija':'🚢',
  'transport / carina':'🚢','alat i oprema':'🔧','knjigovodstvo':'📊','reklama':'📣',
  'ostalo':'📌'};
const ikonaTroska=k=>IKONE_TROSKA[String(k).trim().toLowerCase()]||'📌';

function fillSelect(id,items,def){
  const e=$(id);if(!e)return;
  e.innerHTML='<option value="">— izaberi —</option>'+(items||[]).map(x=>`<option>${x}</option>`).join('');
  if(def&&(items||[]).some(x=>String(x).toLowerCase()===String(def).toLowerCase())){
    e.value=(items||[]).find(x=>String(x).toLowerCase()===String(def).toLowerCase());
  }
}
function buildSelects(){
  $('product_sku').innerHTML='<option value="">— izaberi —</option>'+
    initial.products.map(p=>`<option value="${p.sku}">${p.name}</option>`).join('');
  fillSelect('payment_method',listaIli(initial.paymentMethods,REZ_PLACANJA),'Gotovina');
  fillSelect('cost_category',listaIli(initial.costCategories,REZ_KAT_TROSKA));
  fillSelect('complaint_category',initial.complaintCategories);
  fillSelect('complaint_status',initial.complaintStatuses);
  fillSelect('adjustment_reason',initial.adjustmentReasons);
}

// ---------- DASHBOARD ----------
function setPeriod(days,el){
  currentDays=(days===0?new Date().getDate():days);  // 0 = od početka meseca
  document.querySelectorAll('.tabs .tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  loadHistory();
}

async function loadHistory(){
  status('dashStatus','Učitavanje...','warn');
  try{
    const h=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'history',pin:localStorage.getItem('predatorPin'),days:currentDays})});
    hideStatus('dashStatus');
    $('statCount').textContent=h.brojProdaja||0;
    $('statCountSub').textContent=currentDays===1?'danas':'ovaj mesec';
    $('statSum').textContent=fmtCela(h.prometRsd||0);
    $('statSumEur').textContent='≈ '+fmtCela(h.prometEur||0)+' € (kurs '+kursEur+')';
    renderHistory(h.stavke||[]);
    $('histRange').textContent=currentDays===1?'danas':'ovaj mesec';
  }catch(e){status('dashStatus',e.message,'error')}
}

function renderHistory(lista){
  const cont=$('historyList');
  if(!lista.length){cont.innerHTML='<div class="empty">Nema unosa za ovaj period.</div>';return}
  const ico={sale:'ti-shopping-cart',complaint:'ti-tool',purchase:'ti-package'};
  const kartice=lista.map(s=>{
    const t=s.tip, vreme=formatVreme(s.datum);
    let meta=vreme;
    if(t==='sale'&&s.placanje)meta+=' · '+s.placanje;
    if(t==='complaint'&&s.status)meta+=' · '+s.status;
    if(t==='purchase'&&s.kolicina)meta+=' · '+s.kolicina+' kom';
    let amt='';
    if(s.iznosRsd!=null){
      const cls=t==='sale'?'pos':(t==='complaint'?'neg':'neutral');
      const znak=t==='complaint'?'−':'';
      amt=`<div class="amt ${cls}">${znak}${fmtCela(Math.abs(s.iznosRsd))}<span class="eur">${znak}${fmtCela(Math.abs(s.iznosRsd)/kursEur)} €</span></div>`;
    }else if(t==='purchase'&&s.kolicina){
      amt=`<div class="amt neutral">${s.kolicina}×</div>`;
    }
    const kol=(t==='sale'&&s.kolicina)?' · '+s.kolicina+' kom':'';
    let klik='';
    if(s.id&&t==='sale')klik=` onclick="otvoriIspravku('${esc(s.id)}')" style="cursor:pointer"`;
    else if(s.id&&t==='complaint')klik=` onclick="otvoriIzmenuReklamacije('${esc(s.id)}')" style="cursor:pointer"`;
    return `<div class="item"${klik}>
      <div class="ico ${t}"><i class="ti ${ico[t]||'ti-file'}"></i></div>
      <div class="mid"><div class="name">${esc(s.naziv||'—')}${kol}</div><div class="meta">${esc(meta)}</div></div>
      ${amt}</div>`;
  });

  // Prikazuj samo poslednja dva unosa; ostalo ide iza dugmeta.
  const VIDLJIVO=2;
  if(kartice.length<=VIDLJIVO){cont.innerHTML=kartice.join('');return}
  cont.innerHTML=kartice.slice(0,VIDLJIVO).join('')+
    `<div id="histOstatak"${istorijaOtvorena?'':' class="hidden"'}>${kartice.slice(VIDLJIVO).join('')}</div>`+
    `<button class="act ghost" id="histToggle" onclick="prebaciIstoriju()" style="width:100%;margin-top:8px">`+
    (istorijaOtvorena?'Prikaži manje ↑':'Prikaži još '+(kartice.length-VIDLJIVO)+' ↓')+'</button>';
}

let istorijaOtvorena=false;

function prebaciIstoriju(){
  istorijaOtvorena=!istorijaOtvorena;
  const o=$('histOstatak'), b=$('histToggle');
  if(!o||!b)return;
  o.classList.toggle('hidden',!istorijaOtvorena);
  b.textContent=istorijaOtvorena?'Prikaži manje ↑':'Prikaži još '+o.children.length+' ↓';
}

function formatVreme(iso){
  const d=new Date(iso), danas=new Date();
  const juce=new Date(danas);juce.setDate(juce.getDate()-1);
  const hh=String(d.getHours()).padStart(2,'0'), mn=String(d.getMinutes()).padStart(2,'0');
  if(d.toDateString()===danas.toDateString())return 'danas '+hh+':'+mn;
  if(d.toDateString()===juce.toDateString())return 'juče '+hh+':'+mn;
  return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'. '+hh+':'+mn;
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

// ---------- OTVARANJE ----------
function openEntry(){$('entryCard').classList.remove('hidden')}
function openEntryManual(){openEntry();$('rawText').focus();$('entryCard').scrollIntoView({behavior:'smooth'})}
function closeEntry(){$('entryCard').classList.add('hidden');hideReview();hideStatus('status')}

// ---------- ANALIZA ----------
async function analyzeText(){
  const text=val('rawText').trim();
  if(text.length<3){status('status','Prvo izgovori ili napiši unos.','warn');return}
  status('status','AI analizira unos...','warn');
  try{
    const rez=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'parse',pin:localStorage.getItem('predatorPin'),text})});
    stavke=(rez.stavke||[]).map(normalizuj);
    if(!stavke.length)throw new Error('AI nije prepoznao nijedan unos.');
    aktivnaStavka=0;
    renderTabove();
    prikaziStavku(0);
    $('reviewCard').classList.remove('hidden');
    status('status',stavke.length>1?('Prepoznato '+stavke.length+' artikala — proveri svaki tab.'):'Proveri podatke pre čuvanja.','ok');
    $('reviewCard').scrollIntoView({behavior:'smooth'});
  }catch(e){status('status',e.message,'error')}
}

// Dozvoljene vrste po ulozi + default gotovina
function normalizuj(d){
  const dozv=role==='owner'?['sale','cost','complaint','purchase','adjustment','product_update']:['sale','complaint'];
  if(!dozv.includes(d.entry_type))d.entry_type='sale';
  if(d.entry_type==='sale'&&!d.payment_method)d.payment_method='Gotovina';
  return d;
}

// ---------- TABOVI ZA VIŠE ARTIKALA ----------
function renderTabove(){
  const c=$('stavkeTabs');
  if(stavke.length<2){c.innerHTML='';c.classList.add('hidden');return}
  c.classList.remove('hidden');
  c.innerHTML=stavke.map((s,i)=>{
    const ime=nazivStavke(s,i);
    return `<div class="stab${i===aktivnaStavka?' active':''}" onclick="prebaciStavku(${i})">${esc(ime)}</div>`;
  }).join('');
}
function nazivStavke(s,i){
  if(s.product_sku&&initial){
    const p=initial.products.find(x=>x.sku===s.product_sku);
    if(p)return (s.quantity?s.quantity+'× ':'')+p.name.substring(0,16);
  }
  return 'Stavka '+(i+1);
}
function prebaciStavku(i){
  sacuvajUFormu(aktivnaStavka);
  aktivnaStavka=i;
  renderTabove();
  prikaziStavku(i);
}

// Popuni formu iz stavke
function prikaziStavku(i){
  const d=stavke[i];if(!d)return;
  setVal('entry_type',d.entry_type);
  setVal('product_sku',d.product_sku);
  setVal('quantity',d.quantity);
  setVal('purchase_quantity',d.quantity);
  setVal('unit_sale_price_rsd',d.unit_sale_price_rsd!=null?fmt(d.unit_sale_price_rsd):'');
  setVal('total_amount_rsd',d.total_amount_rsd!=null?fmt(d.total_amount_rsd):'');
  ['description','complaint_status','container_invoice','adjustment_reason','notes']
    .forEach(id=>setVal(id,d[id]));
  ['part_cost_rsd','labor_cost_rsd','shipping_cost_rsd','refund_rsd','other_cost_rsd',
   'supplier_reimbursement_rsd','unit_landed_cost_rsd','unit_cost_amount','exchange_rate_rsd',
   'stock_on_hand','default_sale_price_rsd','quantity_change'].forEach(id=>{
    setVal(id,d[id]!=null?fmt(d[id]):'');
  });
  setVal('payment_method',d.payment_method||'Gotovina');
  setVal('isporuka',d.isporuka||'Licno');
  setVal('cost_category',d.cost_category);
  setVal('complaint_category',d.cost_category);
  setVal('supplier',d.supplier);
  setVal('purchase_supplier',d.supplier);
  setVal('supplier_reimbursed',d.supplier_reimbursed===true?'true':d.supplier_reimbursed===false?'false':'');
  setVal('cost_currency',d.cost_currency&&d.cost_currency!=='UNKNOWN'?d.cost_currency:'EUR');

  const msg=$('reviewMessage');
  if(d.needs_review){msg.textContent=d.review_message||'Proveri unos.';msg.style.display='block';$('reviewCard').classList.add('review')}
  else{msg.style.display='none';$('reviewCard').classList.remove('review')}
  toggleSections();
  prikaziEurPreracun();
}

// Sačuvaj izmene iz forme nazad u stavku
function sacuvajUFormu(i){
  const d=stavke[i];if(!d)return;
  const t=val('entry_type');
  d.entry_type=t;
  d.product_sku=val('product_sku')||null;
  d.quantity=t==='purchase'?numOrNull('purchase_quantity'):numOrNull('quantity');
  d.unit_sale_price_rsd=numOrNull('unit_sale_price_rsd');
  d.total_amount_rsd=numOrNull('total_amount_rsd');
  d.payment_method=val('payment_method')||'Gotovina';
  d.isporuka=val('isporuka')||'Licno';
  d.cost_category=t==='complaint'?(val('complaint_category')||null):(val('cost_category')||null);
  d.description=val('description')||null;
  d.supplier=t==='purchase'?(val('purchase_supplier')||null):(val('supplier')||null);
  d.part_cost_rsd=numOrNull('part_cost_rsd');
  d.labor_cost_rsd=numOrNull('labor_cost_rsd');
  d.shipping_cost_rsd=numOrNull('shipping_cost_rsd');
  d.refund_rsd=numOrNull('refund_rsd');
  d.other_cost_rsd=numOrNull('other_cost_rsd');
  d.supplier_reimbursed=val('supplier_reimbursed')===''?null:val('supplier_reimbursed')==='true';
  d.supplier_reimbursement_rsd=numOrNull('supplier_reimbursement_rsd');
  d.complaint_status=val('complaint_status')||null;
  d.container_invoice=val('container_invoice')||null;
  d.unit_landed_cost_rsd=numOrNull('unit_landed_cost_rsd');
  d.quantity_change=numOrNull('quantity_change');
  d.adjustment_reason=val('adjustment_reason')||null;
  d.unit_cost_amount=numOrNull('unit_cost_amount');
  d.cost_currency=val('cost_currency')||'EUR';
  d.exchange_rate_rsd=numOrNull('exchange_rate_rsd');
  d.stock_on_hand=numOrNull('stock_on_hand');
  d.default_sale_price_rsd=numOrNull('default_sale_price_rsd');
  d.notes=val('notes')||null;
}

function toggleSections(){
  const t=val('entry_type');
  ['saleFields','costFields','complaintFields','purchaseFields','adjustmentFields','productUpdateFields']
    .forEach(id=>{const e=$(id);if(e)e.classList.add('hidden')});
  const map={sale:'saleFields',cost:'costFields',complaint:'complaintFields',
    purchase:'purchaseFields',adjustment:'adjustmentFields',product_update:'productUpdateFields'};
  const e=$(map[t]);if(e)e.classList.remove('hidden');
}

// Prikaz "≈ X €" ispod cene
function prikaziEurPreracun(){
  const el=$('eurPreracun');if(!el)return;
  const c=numOrNull('unit_sale_price_rsd');
  const k=numOrNull('quantity')||1;
  if(c){
    el.textContent='≈ '+fmtCela(c/kursEur)+' € po komadu · ukupno '+fmtCela(c*k)+' RSD ('+fmtCela(c*k/kursEur)+' €)';
    el.style.display='block';
  }else el.style.display='none';
}

// Kad korisnik izabere proizvod — povuci podrazumevanu cenu ako je polje prazno
function proizvodPromenjen(){
  const sku=val('product_sku');
  if(!sku||!initial)return;
  const p=initial.products.find(x=>x.sku===sku);
  if(p&&p.defaultPriceRsd&&!val('unit_sale_price_rsd')){
    setVal('unit_sale_price_rsd',fmt(p.defaultPriceRsd));
    prikaziEurPreracun();
  }
}

// ---------- SAVE ----------
async function save(){
  if(cuvanjeUToku)return;               // spreči dvostruki klik
  sacuvajUFormu(aktivnaStavka);
  cuvanjeUToku=true;
  zakljucajDugmad(true);
  status('status','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'saveMulti',idem:idemKljuc('save'),pin:localStorage.getItem('predatorPin'),
        enteredBy:localStorage.getItem('predatorUser')||'Radnik',stavke:stavke})});
    const greske=(r.rezultati||[]).filter(x=>!x.ok);
    if(greske.length){
      status('status',r.message+' — '+greske.map(g=>'#'+g.redni+': '+g.error).join('; '),'warn');
      cuvanjeUToku=false;zakljucajDugmad(false);
    }else{
      status('status',r.message,'ok');
      idemGotovo('save');
      $('rawText').value='';stavke=[];hideReview();
      setTimeout(()=>{
        closeEntry();loadHistory();window.scrollTo({top:0,behavior:'smooth'});
        cuvanjeUToku=false;zakljucajDugmad(false);
      },1200);
    }
  }catch(e){
    status('status',e.message,'error');
    cuvanjeUToku=false;zakljucajDugmad(false);
  }
}
function hideReview(){$('reviewCard').classList.add('hidden');$('stavkeTabs').classList.add('hidden')}

// ---------- AUTO-LOGIN ----------
addEventListener('load',()=>{
  const pin=localStorage.getItem('predatorPin');
  if(pin){setVal('pin',pin);login()}
  // formatiranje cena dok se kuca
  ['unit_sale_price_rsd','total_amount_rsd','part_cost_rsd','labor_cost_rsd','shipping_cost_rsd',
   'refund_rsd','other_cost_rsd','supplier_reimbursement_rsd','unit_landed_cost_rsd',
   'default_sale_price_rsd'].forEach(id=>{
    const e=$(id);
    if(e){
      e.addEventListener('blur',()=>{formatirajPolje(e);prikaziEurPreracun()});
      e.addEventListener('input',()=>{if(id==='unit_sale_price_rsd')prikaziEurPreracun()});
    }
  });
  const q=$('quantity');if(q)q.addEventListener('input',prikaziEurPreracun);
  const ps=$('product_sku');if(ps)ps.addEventListener('change',proizvodPromenjen);
});


// ═══════════ BRZI UNOS: kategorije → artikli → potvrda ═══════════
let izabraniArtikal=null;

function otvoriBrzi(){
  if(prekidacKartice('brziUnos'))return;
  prikaziKarticu('brziUnos');
  $('potvrdaCard').classList.add('hidden');
  nazadNaKategorije();
  $('brziUnos').scrollIntoView({behavior:'smooth'});
}
function zatvoriBrzi(){ nazadNaPocetnu(); }

function nazadNaKategorije(){
  $('brziNaslov').textContent='Izaberi kategoriju';
  $('artikliLista').classList.add('hidden');
  $('kategorijeLista').classList.remove('hidden');
  $('bezKategorije').style.display='';
  $('nazadBtn').style.display='none';
  $('potvrdaCard').classList.add('hidden');
  renderKategorije();
}

function renderKategorije(){
  const kat=(initial&&initial.kategorije)||[];
  const c=$('kategorijeLista');
  if(!kat.length){
    c.innerHTML='<div class="empty" style="grid-column:1/-1">Nema kategorija. Pokreni postaviKategorije() u Apps Script-u.</div>';
  }else{
    c.innerHTML=kat.map(k=>{
      const broj=(initial.products||[]).filter(p=>p.grupa===k).length;
      return `<div class="gbtn kat" onclick="otvoriKategoriju('${esc(k).replace(/'/g,"\\'")}')">${esc(k)}<span class="cena">${broj} art.</span></div>`;
    }).join('');
  }
  // Artikli bez grupe
  const bez=(initial.products||[]).filter(p=>!p.grupa);
  const bc=$('bezKatLista');
  if(!bez.length){$('bezKategorije').style.display='none';}
  else{
    $('bezKategorije').style.display='';
    bc.innerHTML=bez.map(p=>dugmeArtikla(p)).join('');
  }
}

function dugmeArtikla(p){
  const cena=p.defaultPriceRsd?(fmtCela(p.defaultPriceRsd)+' RSD'):'nema cenu';
  const lager=(p.naStanju==null)?''
    :`<div class="l${(p.naStanju<=5?' malo':'')}">Lager: ${p.naStanju} kom</div>`;
  return `<div class="art-row" onclick="izaberiArtikal('${esc(p.sku)}')">`+
    `<div class="an"><div class="t">${esc(p.name)}</div>${lager}</div>`+
    `<div class="ac">${cena}</div><span class="krug"></span></div>`;
}

let zadnjaKategorija=null;
let _toastT=null;
function toast(naslov,pod,tip){
  const t=$('toast'); if(!t)return;
  const err=(tip==='err');
  t.classList.toggle('err',err);
  t.querySelector('.tico').textContent=err?'!':'✓';
  $('toastN').textContent=naslov;
  $('toastS').textContent=pod||'';
  t.classList.add('show');
  if(_toastT)clearTimeout(_toastT);
  _toastT=setTimeout(()=>t.classList.remove('show'),err?3400:1900);
}
function otvoriKategoriju(kat){
  zadnjaKategorija=kat;
  const lista=(initial.products||[]).filter(p=>p.grupa===kat);
  $('brziNaslov').textContent=kat;
  $('kategorijeLista').classList.add('hidden');
  $('bezKategorije').style.display='none';
  $('nazadBtn').style.display='';
  const c=$('artikliLista');
  c.classList.remove('hidden');
  c.innerHTML=lista.length?lista.map(p=>dugmeArtikla(p)).join('')
    :'<div class="empty" style="grid-column:1/-1">Nema artikala u ovoj kategoriji.</div>';
}

function izaberiArtikal(sku){
  const p=(initial.products||[]).find(x=>x.sku===sku);
  if(!p)return;
  izabraniArtikal=p;
  $('potvrdaNaziv').textContent=p.name;
  setVal('p_kolicina',1);
  setVal('p_cena',p.defaultPriceRsd?fmt(p.defaultPriceRsd):'');
  setVal('p_napomena','');
  setVal('p_isporuka','');   // isporuka mora da se bira svaki put (ne pamti prethodno)
  fillSelect('p_placanje',listaIli(initial.paymentMethods,REZ_PLACANJA),'Gotovina');
  hideStatus('potvrdaStatus');
  osveziUkupno();
  $('brziUnos').classList.add('hidden');
  prikaziKarticu('potvrdaCard');
  $('potvrdaCard').scrollIntoView({behavior:'smooth'});
}

function otkaziPotvrdu(){
  $('potvrdaCard').classList.add('hidden');
  prikaziKarticu('brziUnos');
}

function osveziUkupno(){
  const k=Number(val('p_kolicina'))||0;
  const c=numOrNull('p_cena')||0;
  const uk=k*c;
  $('p_ukupno').innerHTML=uk?('<span class="uk-l">Ukupno</span><span class="uk-b">'+fmtCela(uk)+' RSD</span><span class="uk-e">≈ '+fmtCela(uk/kursEur)+' €</span>'):'';
  // Poštarina: samo ako je Aksom i artikal ima upisan iznos
  const el=$('p_postarina');
  if(!el)return;
  const aks=(val('p_isporuka')||'').toLowerCase().indexOf('aks')===0;
  const pt=(izabraniArtikal&&izabraniArtikal.postarinaRsd)||0;
  if(aks&&pt>0){
    const uku=pt*(k||1);
    el.textContent='Poštarina koju mi plaćamo: −'+fmtCela(uku)+' RSD';
    el.style.color='var(--red-l)';
    el.style.display='block';
  }else{el.style.display='none'}
}

let cuvanjeUToku=false;

function zakljucajDugmad(zakljucaj){
  document.querySelectorAll('button.act.primary').forEach(b=>{
    b.disabled=zakljucaj;
    b.style.opacity=zakljucaj?'0.5':'';
    b.style.pointerEvents=zakljucaj?'none':'';
  });
}

async function potvrdiArtikal(){
  if(cuvanjeUToku)return;               // spreči dvostruki klik
  if(!izabraniArtikal)return;
  const kol=Number(val('p_kolicina'))||1;
  const cena=numOrNull('p_cena');
  if(!cena){status('potvrdaStatus','Unesi cenu.','warn');return}
  const isp=val('p_isporuka');
  if(!isp){status('potvrdaStatus','Izaberi način isporuke (lično preuzimanje ili Aksom).','warn');return}
  cuvanjeUToku=true;
  zakljucajDugmad(true);
  status('potvrdaStatus','Čuvanje...','warn');
  const stavka={
    entry_type:'sale',
    product_sku:izabraniArtikal.sku,
    quantity:kol,
    unit_sale_price_rsd:cena,
    payment_method:val('p_placanje')||'Gotovina',
    isporuka:isp,
    notes:val('p_napomena')||null,
    raw_text:'Brzi unos: '+izabraniArtikal.name
  };
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'saveMulti',idem:idemKljuc('brzi'),pin:localStorage.getItem('predatorPin'),
        enteredBy:localStorage.getItem('predatorUser')||'Radnik',stavke:[stavka]})});
    idemGotovo('brzi');
    // vesela brza potvrda + odmah nazad na artikle iste kategorije (brzi niz unosa)
    toast('Prodato! 🎉', izabraniArtikal.name+' · '+kol+' kom · '+fmtCela(kol*cena)+' RSD');
    setTimeout(()=>{
      izabraniArtikal=null;
      prikaziKarticu('brziUnos');
      if(zadnjaKategorija)otvoriKategoriju(zadnjaKategorija); else nazadNaKategorije();
      loadHistory();
      cuvanjeUToku=false;
      zakljucajDugmad(false);
    },350);
  }catch(e){
    status('potvrdaStatus',e.message,'error');
    cuvanjeUToku=false;
    zakljucajDugmad(false);
  }
}

// Osvežavanje ukupnog iznosa dok se kuca
addEventListener('load',()=>{
  const k=$('p_kolicina'), c=$('p_cena');
  if(k)k.addEventListener('input',osveziUkupno);
  if(c){
    c.addEventListener('input',osveziUkupno);
    c.addEventListener('blur',()=>{formatirajPolje(c);osveziUkupno()});
  }
});


// ═══════════ ISPRAVKA UNOSA ═══════════
let ispravkaId=null, ispravkaStavka=null;

async function otvoriIspravku(id){
  status('dashStatus','Učitavanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'izmenjive',pin:localStorage.getItem('predatorPin'),days:7})});
    hideStatus('dashStatus');
    const st=(r.stavke||[]).find(x=>x.id===id);
    if(!st){status('dashStatus','Ovaj unos se ne može izmeniti (stariji od 7 dana).','warn');return}
    ispravkaId=id; ispravkaStavka=st;
    $('ispNaziv').textContent=st.naziv||'Unos';
    $('ispInfo').textContent=formatVreme(st.datum)+' · uneo: '+(st.korisnik||'—');
    setVal('i_kolicina',st.kolicina);
    setVal('i_cena',fmt(st.cena));
    setVal('i_napomena',st.napomena||'');
    fillSelect('i_placanje',listaIli(initial.paymentMethods,REZ_PLACANJA),st.placanje||'Gotovina');
    hideStatus('ispStatus');
    osveziIspUkupno();
    prikaziKarticu('ispravkaCard');
    $('ispravkaCard').scrollIntoView({behavior:'smooth'});
  }catch(e){status('dashStatus',e.message,'error')}
}

function zatvoriIspravku(){ ispravkaId=null; ispravkaStavka=null; nazadNaPocetnu(); }

function osveziIspUkupno(){
  const k=Number(val('i_kolicina'))||0;
  const c=numOrNull('i_cena')||0;
  const uk=k*c;
  $('i_ukupno').textContent=uk?('Ukupno: '+fmtCela(uk)+' RSD  ·  '+fmtCela(uk/kursEur)+' €'):'';
}

async function sacuvajIspravku(){
  if(!ispravkaId)return;
  const kol=Number(val('i_kolicina'))||0;
  const cena=numOrNull('i_cena');
  if(!(kol>0)){status('ispStatus','Količina mora biti veća od 0.','warn');return}
  if(cena===null){status('ispStatus','Unesi cenu.','warn');return}
  status('ispStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'izmeni',idem:idemKljuc('izmeni'),pin:localStorage.getItem('predatorPin'),
        enteredBy:localStorage.getItem('predatorUser')||'Radnik',
        id:ispravkaId,izmene:{quantity:kol,unit_sale_price_rsd:cena,
          payment_method:val('i_placanje'),notes:val('i_napomena')}})});
    status('ispStatus',r.message,'ok');
    idemGotovo('izmeni');
    setTimeout(()=>{zatvoriIspravku();loadHistory()},900);
  }catch(e){status('ispStatus',e.message,'error')}
}

async function obrisiUnos(){
  if(!ispravkaId)return;
  const naziv=(ispravkaStavka&&ispravkaStavka.naziv)||'ovaj unos';
  if(!confirm('Obrisati "'+naziv+'"?\n\nUnos će nestati iz tabele, ali ostaje trag u listu "Izmene unosa".'))return;
  status('ispStatus','Brisanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'obrisi',idem:idemKljuc('obrisi'),pin:localStorage.getItem('predatorPin'),
        enteredBy:localStorage.getItem('predatorUser')||'Radnik',id:ispravkaId,razlog:'Ispravka iz aplikacije'})});
    status('ispStatus',r.message,'ok');
    idemGotovo('obrisi');
    setTimeout(()=>{zatvoriIspravku();loadHistory()},900);
  }catch(e){status('ispStatus',e.message,'error')}
}

addEventListener('load',()=>{
  const k=$('i_kolicina'), c=$('i_cena');
  if(k)k.addEventListener('input',osveziIspUkupno);
  if(c){
    c.addEventListener('input',osveziIspUkupno);
    c.addEventListener('blur',()=>{formatirajPolje(c);osveziIspUkupno()});
  }
});


// ═══════════ TROŠKOVI: vrsta → iznos → čuvanje (samo vlasnik) ═══════════
let izabranaKatTroska=null;

function otvoriTroskove(){
  if(role!=='owner')return;
  if(prekidacKartice('troskoviUnos'))return;
  $('trosakCard').classList.add('hidden');
  prikaziKarticu('troskoviUnos');
  renderKatTroskova();
  $('troskoviUnos').scrollIntoView({behavior:'smooth'});
}

function zatvoriTroskove(){ nazadNaPocetnu(); }

function nazadNaKatTroskova(){
  $('trosakCard').classList.add('hidden');
  prikaziKarticu('troskoviUnos');
}

function renderKatTroskova(){
  const kat=listaIli(initial&&initial.costCategories,REZ_KAT_TROSKA);
  $('katTroskovaLista').innerHTML=kat.map(k=>
    `<div class="gbtn" onclick="izaberiKatTroska('${esc(k).replace(/'/g,"\\'")}')">`+
    `<span class="emo">${ikonaTroska(k)}</span>${esc(k)}</div>`
  ).join('');
}

function izaberiKatTroska(kat){
  izabranaKatTroska=kat;
  $('trosakNaslov').textContent=kat;
  setVal('t_eur','');setVal('t_rsd','');setVal('t_opis','');setVal('t_kome','');
  fillSelect('t_placanje',listaIli(initial.paymentMethods,REZ_PLACANJA),'Gotovina');
  hideStatus('trosakStatus');
  $('troskoviUnos').classList.add('hidden');
  prikaziKarticu('trosakCard');
  $('trosakCard').scrollIntoView({behavior:'smooth'});
}

// Upišeš u jedno polje — drugo se samo popuni (kurs 117.5).
function trosakIzEur(){const e=numOrNull('t_eur');setVal('t_rsd',e?fmt(Math.round(e*kursEur)):'')}
function trosakIzRsd(){const r=numOrNull('t_rsd');setVal('t_eur',r?fmt(Math.round(r/kursEur*100)/100):'')}

async function sacuvajTrosak(){
  if(cuvanjeUToku)return;                 // spreči dvostruki klik
  if(!izabranaKatTroska)return;
  const rsd=numOrNull('t_rsd');
  if(!rsd){status('trosakStatus','Unesi iznos.','warn');return}
  if(!val('t_opis')){status('trosakStatus','Unesi opis troška.','warn');return}
  cuvanjeUToku=true;
  zakljucajDugmad(true);
  status('trosakStatus','Čuvanje...','warn');
  const stavka={
    entry_type:'cost',
    cost_category:izabranaKatTroska,
    total_amount_rsd:rsd,
    description:val('t_opis')||null,
    supplier:val('t_kome')||null,
    payment_method:val('t_placanje')||'Gotovina',
    raw_text:'Brzi unos troška: '+izabranaKatTroska
  };
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'saveMulti',idem:idemKljuc('trosak'),pin:localStorage.getItem('predatorPin'),
        enteredBy:localStorage.getItem('predatorUser')||'Radnik',stavke:[stavka]})});
    status('trosakStatus',r.message,'ok');
    idemGotovo('trosak');
    setTimeout(()=>{
      izabranaKatTroska=null;
      nazadNaKatTroskova();
      loadHistory();
      cuvanjeUToku=false;
      zakljucajDugmad(false);
    },900);
  }catch(e){
    status('trosakStatus',e.message,'error');
    cuvanjeUToku=false;
    zakljucajDugmad(false);
  }
}

addEventListener('load',()=>{
  const eu=$('t_eur'), rs=$('t_rsd');
  if(eu){eu.addEventListener('input',trosakIzEur);eu.addEventListener('blur',()=>formatirajPolje(eu))}
  if(rs){rs.addEventListener('input',trosakIzRsd);rs.addEventListener('blur',()=>formatirajPolje(rs))}
});


// ═══════════ REKLAMACIJA: artikal → kvar → trošak (i radnik i vlasnik) ═══════════
function otvoriReklamaciju(){
  if(prekidacKartice('reklamacijaCard'))return;
  // Proizvodi
  const opts=(initial.products||[]).map(p=>`<option value="${esc(p.sku)}">${esc(p.name)}</option>`).join('');
  $('rk_proizvod').innerHTML='<option value="">— izaberi artikal —</option>'+opts;
  fillSelect('rk_vrsta',listaIli(initial.complaintCategories,REZ_KVAR));
  fillSelect('rk_status',listaIli(initial.complaintStatuses,REZ_STATUS),'Otvorena');
  ['rk_opis','rk_deo','rk_rad','rk_postarina','rk_povracaj','rk_napomena'].forEach(id=>setVal(id,''));
  osveziRkUkupno();
  hideStatus('rkStatus');
  prikaziKarticu('reklamacijaCard');
  $('reklamacijaCard').scrollIntoView({behavior:'smooth'});
}

function zatvoriReklamaciju(){ nazadNaPocetnu(); }

function osveziRkUkupno(){
  const uk=(numOrNull('rk_deo')||0)+(numOrNull('rk_rad')||0)+
           (numOrNull('rk_postarina')||0)+(numOrNull('rk_povracaj')||0);
  const el=$('rk_ukupno');
  el.textContent=uk?('Ukupan trošak: '+fmtCela(uk)+' RSD  ·  '+fmtCela(uk/kursEur)+' €'):'';
}

async function sacuvajReklamaciju(){
  if(cuvanjeUToku)return;                 // spreči dvostruki klik
  const sku=val('rk_proizvod');
  if(!sku){status('rkStatus','Izaberi artikal.','warn');return}
  if(!val('rk_opis')){status('rkStatus','Upiši opis kvara.','warn');return}
  cuvanjeUToku=true;
  zakljucajDugmad(true);
  status('rkStatus','Čuvanje...','warn');
  const naziv=((initial.products||[]).find(p=>p.sku===sku)||{}).name||sku;
  const stavka={
    entry_type:'complaint',
    product_sku:sku,
    cost_category:val('rk_vrsta')||'Ostalo',
    description:val('rk_opis')||null,
    part_cost_rsd:numOrNull('rk_deo'),
    labor_cost_rsd:numOrNull('rk_rad'),
    shipping_cost_rsd:numOrNull('rk_postarina'),
    refund_rsd:numOrNull('rk_povracaj'),
    complaint_status:val('rk_status')||'Otvorena',
    notes:val('rk_napomena')||null,
    raw_text:'Brzi unos reklamacije: '+naziv
  };
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'saveMulti',idem:idemKljuc('rekl'),pin:localStorage.getItem('predatorPin'),
        enteredBy:localStorage.getItem('predatorUser')||'Radnik',stavke:[stavka]})});
    status('rkStatus',r.message,'ok');
    idemGotovo('rekl');
    setTimeout(()=>{
      zatvoriReklamaciju();
      loadHistory();
      cuvanjeUToku=false;
      zakljucajDugmad(false);
    },900);
  }catch(e){
    status('rkStatus',e.message,'error');
    cuvanjeUToku=false;
    zakljucajDugmad(false);
  }
}

addEventListener('load',()=>{
  ['rk_deo','rk_rad','rk_postarina','rk_povracaj'].forEach(id=>{
    const e=$(id);
    if(e){
      e.addEventListener('input',osveziRkUkupno);
      e.addEventListener('blur',()=>{formatirajPolje(e);osveziRkUkupno()});
    }
  });
});


// ═══════════ PREGLED MESECA (samo vlasnik) ═══════════
const PG_BOJE={nabavka:'#7c8a9a',fiksni:'#ef9f27',varijabilni:'#378add',reklamacije:'#e24b4a',neto:'#5dcaa5'};

let pgGodina, pgMesec;

function otvoriPregled(){
  if(role!=='owner')return;
  if(prekidacKartice('pregledCard'))return;
  const now=new Date();
  pgGodina=now.getFullYear(); pgMesec=now.getMonth()+1;   // uvek kreće od tekućeg
  prikaziKarticu('pregledCard');
  popuniPgPeriod();
  $('pregledCard').scrollIntoView({behavior:'smooth'});
  ucitajPregled();
}

function pregledMesec(delta){
  pgMesec+=delta;
  if(pgMesec<1){pgMesec=12;pgGodina--;}
  else if(pgMesec>12){pgMesec=1;pgGodina++;}
  ucitajPregled();
}

function ucitajPregled(){
  $('pgBody').style.display='none';
  status('pgStatus','Učitavanje...','warn');
  api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'pregled',pin:localStorage.getItem('predatorPin'),godina:pgGodina,mesec:pgMesec})})
    .then(d=>{hideStatus('pgStatus');renderPregled(d);$('pgBody').style.display='';osveziPgNav();})
    .catch(e=>status('pgStatus',e.message,'error'));
}

// Ne dozvoljava napred dalje od tekućeg meseca
function osveziPgNav(){
  const now=new Date();
  const tekuci=(pgGodina===now.getFullYear() && pgMesec===now.getMonth()+1);
  const nx=$('pgNext'); if(nx)nx.disabled=tekuci;
  const sel=$('pgPeriod'); if(sel)sel.value=pgGodina+'-'+pgMesec;
}

// Izbor perioda gore: poslednja 24 meseca u padajućoj listi
function popuniPgPeriod(){
  const sel=$('pgPeriod'); if(!sel)return;
  const now=new Date();
  let g=now.getFullYear(), m=now.getMonth()+1, ops=[];
  for(let i=0;i<24;i++){
    ops.push(`<option value="${g}-${m}">${MESECI[m-1]} ${g}</option>`);
    m--; if(m<1){m=12;g--;}
  }
  sel.innerHTML=ops.join('');
  sel.value=pgGodina+'-'+pgMesec;
}
function pgPeriodPromena(){
  const v=(val('pgPeriod')||'').split('-');
  if(v.length!==2)return;
  pgGodina=Number(v[0]); pgMesec=Number(v[1]);
  ucitajPregled();
}

function zatvoriPregled(){ nazadNaPocetnu(); }

function donutSVG(segments,centerTop,centerBot){
  const r=52,cx=70,cy=70,C=2*Math.PI*r;
  const total=segments.reduce((s,x)=>s+Math.max(0,x.value),0)||1;
  let off=0,circ='';
  segments.forEach(s=>{
    const v=Math.max(0,s.value); if(v<=0)return;
    const len=C*v/total;
    circ+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="16" `+
          `stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" `+
          `transform="rotate(-90 ${cx} ${cy})"/>`;
    off+=len;
  });
  return `<svg width="150" height="150" viewBox="0 0 140 140">`+
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--card2)" stroke-width="16"/>`+circ+
    `<text x="${cx}" y="${cy-2}" text-anchor="middle" fill="var(--txt)" font-size="22" font-weight="700">${centerTop}</text>`+
    `<text x="${cx}" y="${cy+16}" text-anchor="middle" fill="var(--muted)" font-size="11">${centerBot}</text></svg>`;
}

function renderPregled(d){
  const eur=n=>'≈ '+fmtCela(n/kursEur)+' €';
  $('pgPromet').textContent=fmtCela(d.promet)+' RSD';
  $('pgPrometEur').textContent=d.brojProdaja+' '+prodajaRec(d.brojProdaja)+' · '+eur(d.promet);
  $('pgBrProdaja').textContent=d.brojProdaja||0;
  $('pgNeto').textContent=fmtCela(d.neto)+' RSD';
  $('pgNetoEur').textContent=eur(d.neto);
  // vertikalni grafikon po danima (kao mockup)
  const dch=d.poDanima||[];
  if(dch.length){
    const maxC=Math.max.apply(null,dch.map(x=>x.promet));
    $('pgChart').innerHTML=dch.map(x=>{
      const h=maxC>0?Math.max(6,Math.round(x.promet/maxC*100)):6;
      return `<div class="bar" style="height:${h}%" title="${String(x.dan).padStart(2,'0')}. · ${fmtCela(x.promet)} RSD"></div>`;
    }).join('');
  } else $('pgChart').innerHTML='';

  const seg=[
    {nm:'Nabavna vrednost',value:d.nabavka,color:PG_BOJE.nabavka},
    {nm:'Fiksni troškovi',value:d.fiksni,color:PG_BOJE.fiksni},
    {nm:'Varijabilni',value:d.varijabilni,color:PG_BOJE.varijabilni},
    {nm:'Reklamacije',value:d.reklamacije,color:PG_BOJE.reklamacije},
    {nm:'Zarada (neto)',value:d.neto,color:PG_BOJE.neto}
  ];
  const marza=d.promet>0?Math.round(d.neto/d.promet*100):0;
  $('pgDonut').innerHTML=donutSVG(seg,marza+'%','neto marža');
  $('pgLegend').innerHTML=seg.map(s=>
    `<div class="pg-leg"><span class="dot" style="background:${s.color}"></span>`+
    `<span class="nm">${s.nm}</span><span class="vl">${fmtCela(s.value)} RSD</span></div>`).join('');

  const kuda=d.kudaOdlazi||[];
  if(!kuda.length){
    $('pgKuda').innerHTML='<div class="empty">Nema varijabilnih troškova ovog meseca.</div>';
  }else{
    const max=Math.max.apply(null,kuda.map(k=>k.iznos));
    $('pgKuda').innerHTML=kuda.map(k=>{
      const pct=max>0?Math.round(k.iznos/max*100):0;
      return `<div class="pg-bar"><div class="top"><span>${esc(k.kategorija)}</span>`+
        `<span class="vl">${fmtCela(k.iznos)} RSD</span></div>`+
        `<div class="pg-track"><div class="pg-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');
  }

  const top=d.topArtikli||[];
  if(!top.length){
    $('pgTop').innerHTML='<div class="empty">Nema prodaja ovog meseca.</div>';
  }else{
    $('pgTop').innerHTML=top.map((t,i)=>
      `<div class="rang"><span class="rb">${i+1}</span>`+
      `<span class="rn">${esc(t.naziv)}</span>`+
      `<span class="rv"><b>${t.kolicina} kom</b><span>${fmtCela(t.promet)} RSD</span></span></div>`
    ).join('');
  }

  // Po danima (dole): dan · broj prodaja · iznos
  const dani=d.poDanima||[];
  const mb=String(d.mesecBroj||'').padStart(2,'0');
  $('pgDaniSub').textContent=dani.length?(dani.length+' dana sa prodajom'):'';
  if(!dani.length){
    $('pgDani').innerHTML='<div class="empty">Nema prodaja ovog meseca.</div>';
  }else{
    $('pgDani').innerHTML=dani.map(x=>
      `<div class="rang"><span class="rb dan">${String(x.dan).padStart(2,'0')}</span>`+
      `<span class="rn">${String(x.dan).padStart(2,'0')}.${mb}. · ${x.broj} ${prodajaRec(x.broj)}</span>`+
      `<span class="rv"><b>${fmtCela(x.promet)} RSD</b></span></div>`
    ).join('');
  }
}


// ═══════════ POVRAT ARTIKLA (samo vlasnik) ═══════════
const MESECI=['Januar','Februar','Mart','April','Maj','Jun','Jul','Avgust','Septembar','Oktobar','Novembar','Decembar'];
let pvGodina, pvMesec, pvIzabrana=null;

function otvoriPovrat(){
  if(prekidacKartice('povratCard'))return;
  const now=new Date();
  pvGodina=now.getFullYear(); pvMesec=now.getMonth()+1;   // podrazumevano TEKUĆI mesec
  pvIzabrana=null;
  const opts=(initial.products||[]).map(p=>`<option value="${esc(p.sku)}">${esc(p.name)}</option>`).join('');
  $('pv_proizvod').innerHTML='<option value="">— izaberi artikal —</option>'+opts;
  $('pvLista').innerHTML='';
  $('pvPotvrda').classList.add('hidden'); pvKoraci(0);
  hideStatus('pvStatus');
  osveziPvNaslov();
  prikaziKarticu('povratCard');
  $('povratCard').scrollIntoView({behavior:'smooth'});
}

function zatvoriPovrat(){ nazadNaPocetnu(); }
function pvKoraci(f){ ['pvK1','pvK2','pvK3'].forEach((id,i)=>{ const e=$(id); if(!e)return; e.classList.toggle('aktivan',i===f); e.classList.toggle('gotov',i<f); }); }
function otkaziPovrat(){ pvIzabrana=null; $('pvPotvrda').classList.add('hidden'); pvKoraci(0); }

function povratMesec(delta){
  pvMesec+=delta;
  if(pvMesec<1){pvMesec=12;pvGodina--;}
  else if(pvMesec>12){pvMesec=1;pvGodina++;}
  osveziPvNaslov();
  otkaziPovrat();
  ucitajPovratKandidate();
}

function osveziPvNaslov(){
  $('pvNaslov').textContent=MESECI[pvMesec-1]+' '+pvGodina;
  const now=new Date();
  const nx=$('pvNext');
  if(nx)nx.disabled=(pvGodina===now.getFullYear() && pvMesec===now.getMonth()+1);
}

function ucitajPovratKandidate(){
  const sku=val('pv_proizvod');
  otkaziPovrat();
  if(!sku){$('pvLista').innerHTML='';return}
  status('pvStatus','Tražim prodaje...','warn');
  api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'povratKandidati',pin:localStorage.getItem('predatorPin'),
      godina:pvGodina,mesec:pvMesec,sku})})
    .then(r=>{
      hideStatus('pvStatus');
      const lista=r.stavke||[];
      if(!lista.length){
        $('pvLista').innerHTML='<div class="empty">Nema prodaja ovog artikla u izabranom mesecu.</div>';
        return;
      }
      $('pvLista').innerHTML='<div class="sec-title">Izaberi prodaju</div>'+lista.map(s=>{
        const d=new Date(s.datum);
        const dat=String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.';
        return `<div class="item" style="cursor:pointer" onclick='izaberiPovrat(${JSON.stringify(s).replace(/'/g,"&#39;")})'>
          <div class="ico sale"><i class="ti ti-shopping-cart"></i></div>
          <div class="mid"><div class="name">${dat} · ${s.ostalo} kom za povrat</div>
          <div class="meta">${esc(s.placanje||'')}</div></div>
          <div class="amt pos">${fmtCela(s.ukupnoRsd)}</div></div>`;
      }).join('');
    })
    .catch(e=>status('pvStatus',e.message,'error'));
}

function izaberiPovrat(s){
  pvIzabrana=s;
  const d=new Date(s.datum);
  const dat=String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear();
  $('pvIzabrana').textContent='Prodaja od '+dat+' · '+s.ostalo+' kom za povrat';
  const k=$('pv_kolicina'); k.value=1; k.max=s.ostalo;
  setVal('pv_razlog','');
  osveziPvIznos();
  $('pvPotvrda').classList.remove('hidden');
  pvKoraci(1);
  $('pvPotvrda').scrollIntoView({behavior:'smooth'});
}

function osveziPvIznos(){
  if(!pvIzabrana)return;
  const k=Number(val('pv_kolicina'))||0;
  const uk=k*(pvIzabrana.cenaRsd||0);
  $('pv_iznos').textContent=uk?('Umanjuje promet za: −'+fmtCela(uk)+' RSD  ·  −'+fmtCela(uk/kursEur)+' €'):'';
}

async function sacuvajPovrat(){
  if(cuvanjeUToku)return;
  if(!pvIzabrana)return;
  const kol=Number(val('pv_kolicina'))||0;
  if(!(kol>0)){status('pvStatus','Količina mora biti veća od 0.','warn');return}
  if(kol>pvIzabrana.ostalo){status('pvStatus','Maksimalno '+pvIzabrana.ostalo+' kom.','warn');return}
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('pvStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'povrat',idem:idemKljuc('povrat'),pin:localStorage.getItem('predatorPin'),
        enteredBy:localStorage.getItem('predatorUser')||'Vlasnik',
        id:pvIzabrana.id,kolicina:kol,razlog:val('pv_razlog')||''})});
    status('pvStatus',r.message,'ok');
    idemGotovo('povrat');
    setTimeout(()=>{
      otkaziPovrat();
      ucitajPovratKandidate();
      loadHistory();
      cuvanjeUToku=false; zakljucajDugmad(false);
    },1000);
  }catch(e){
    status('pvStatus',e.message,'error');
    cuvanjeUToku=false; zakljucajDugmad(false);
  }
}

addEventListener('load',()=>{
  const k=$('pv_kolicina');
  if(k)k.addEventListener('input',osveziPvIznos);
});


// ═══════════ KAPARA (i vlasnik i radnik) ═══════════
// Čista evidencija — ne dira lager, promet ni profit.
function otvoriKapare(){
  if(prekidacKartice('kaparaCard'))return;
  const opts=(initial.products||[]).map(p=>`<option value="${esc(p.sku)}">${esc(p.name)}</option>`).join('');
  $('kp_proizvod').innerHTML='<option value="">— izaberi artikal —</option>'+opts;
  ['kp_kupac','kp_kapara','kp_cena','kp_napomena'].forEach(id=>setVal(id,''));
  osveziKpOstatak();
  hideStatus('kpStatus');
  prikaziKarticu('kaparaCard');
  $('kaparaCard').scrollIntoView({behavior:'smooth'});
  ucitajKapare();
}

function zatvoriKapare(){ nazadNaPocetnu(); }

// Kad izabereš artikal, ponudi njegovu prodajnu cenu (ako polje još nije popunjeno)
function kaparaCenaIzKataloga(){
  const sku=val('kp_proizvod');
  const p=(initial.products||[]).find(x=>x.sku===sku);
  if(p&&p.defaultPriceRsd&&!val('kp_cena'))setVal('kp_cena',fmt(p.defaultPriceRsd));
  osveziKpOstatak();
}

function osveziKpOstatak(){
  const kap=numOrNull('kp_kapara')||0, cena=numOrNull('kp_cena')||0;
  const el=$('kp_ostatak');
  if(cena>0&&kap>0){
    const ost=cena-kap;
    el.textContent='Ostatak za naplatu: '+fmtCela(ost)+' RSD  ·  '+fmtCela(ost/kursEur)+' €';
  }else el.textContent='';
}

function ucitajKapare(){
  api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'kapare',pin:localStorage.getItem('predatorPin')})})
    .then(r=>renderKapare(r.stavke||[]))
    .catch(e=>status('kpStatus',e.message,'error'));
}

function renderKapare(lista){
  const c=$('kpLista');
  if(!lista.length){c.innerHTML='<div class="empty">Nema aktivnih kapara.</div>';return}
  c.innerHTML=lista.map(k=>{
    const d=k.datum?new Date(k.datum):null;
    const dat=d?String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.':'';
    const ost=(k.cena||0)-(k.kapara||0);
    return `<div class="kap-card">
      <div class="kl">AKTIVNA KAPARA</div>
      <div class="kn">${esc(k.naziv)}</div>
      <div class="ki">${fmtCela(k.kapara)} RSD</div>
      <div class="kk">Kupac: ${esc(k.kupac)}${dat?' · '+dat:''}${k.cena?' · ostatak '+fmtCela(ost)+' RSD':''}${k.napomena?' · '+esc(k.napomena):''}</div>
      <div class="kx"><button class="act ghost" style="padding:8px 12px;font-size:13px;color:var(--red-l);border-color:var(--red)!important"
        onclick="obrisiKaparu('${esc(k.id)}')">Obriši</button></div>
    </div>`;
  }).join('');
}

async function sacuvajKaparu(){
  if(cuvanjeUToku)return;
  if(!val('kp_proizvod')){status('kpStatus','Izaberi artikal.','warn');return}
  if(!val('kp_kupac').trim()){status('kpStatus','Upiši ime i prezime kupca.','warn');return}
  const kap=numOrNull('kp_kapara');
  if(!kap||kap<=0){status('kpStatus','Upiši iznos kapare.','warn');return}
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('kpStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'kaparaSacuvaj',idem:idemKljuc('kapara'),pin:localStorage.getItem('predatorPin'),
        data:{product_sku:val('kp_proizvod'),kupac:val('kp_kupac'),
          kapara_rsd:kap,cena_rsd:numOrNull('kp_cena')||0,napomena:val('kp_napomena')||''}})});
    status('kpStatus',r.message,'ok');
    idemGotovo('kapara');
    ['kp_kupac','kp_kapara','kp_cena','kp_napomena'].forEach(id=>setVal(id,''));
    osveziKpOstatak();
    ucitajKapare();
  }catch(e){status('kpStatus',e.message,'error')}
  cuvanjeUToku=false; zakljucajDugmad(false);
}

async function obrisiKaparu(id){
  if(!confirm('Obrisati ovu kaparu?'))return;
  status('kpStatus','Brišem...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'kaparaObrisi',idem:idemKljuc('kaparaDel'),pin:localStorage.getItem('predatorPin'),id})});
    status('kpStatus',r.message,'ok');
    idemGotovo('kaparaDel');
    ucitajKapare();
  }catch(e){status('kpStatus',e.message,'error')}
}

addEventListener('load',()=>{
  ['kp_kapara','kp_cena'].forEach(id=>{
    const e=$(id);
    if(e){
      e.addEventListener('input',osveziKpOstatak);
      e.addEventListener('blur',()=>{formatirajPolje(e);osveziKpOstatak()});
    }
  });
});


// ═══════════ IZMENA / BRISANJE REKLAMACIJE ═══════════
let irId=null;

function otvoriIzmenuReklamacije(id){
  zatvoriSveKartice('izmenaReklCard');
  irId=id;
  status('irStatus','Učitavanje...','warn');
  prikaziKarticu('izmenaReklCard');
  $('izmenaReklCard').scrollIntoView({behavior:'smooth'});
  api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'reklamacija',pin:localStorage.getItem('predatorPin'),id})})
    .then(r=>{
      hideStatus('irStatus');
      $('irNaslov').textContent=r.naziv||'Reklamacija';
      const d=r.datum?new Date(r.datum):null;
      $('irInfo').textContent=d?('uneto '+String(d.getDate()).padStart(2,'0')+'.'+
        String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear()):'';
      fillSelect('ir_vrsta',listaIli(initial.complaintCategories,REZ_KVAR),r.vrsta);
      fillSelect('ir_status',listaIli(initial.complaintStatuses,REZ_STATUS),r.status);
      setVal('ir_opis',r.opis||'');
      setVal('ir_deo',r.deo?fmt(r.deo):'');
      setVal('ir_rad',r.rad?fmt(r.rad):'');
      setVal('ir_postarina',r.postarina?fmt(r.postarina):'');
      setVal('ir_povracaj',r.povracaj?fmt(r.povracaj):'');
      setVal('ir_napomena',r.napomena||'');
      osveziIrUkupno();
    })
    .catch(e=>status('irStatus',e.message,'error'));
}

function zatvoriIzmenuReklamacije(){ irId=null; nazadNaPocetnu(); }

function osveziIrUkupno(){
  const uk=(numOrNull('ir_deo')||0)+(numOrNull('ir_rad')||0)+
           (numOrNull('ir_postarina')||0)+(numOrNull('ir_povracaj')||0);
  $('ir_ukupno').textContent=uk?('Ukupan trošak: '+fmtCela(uk)+' RSD  ·  '+fmtCela(uk/kursEur)+' €'):'';
}

async function sacuvajIzmenuReklamacije(){
  if(!irId||cuvanjeUToku)return;
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('irStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'reklamacijaIzmeni',idem:idemKljuc('reklIzmeni'),pin:localStorage.getItem('predatorPin'),
        id:irId,izmene:{
          vrsta:val('ir_vrsta'),opis:val('ir_opis'),
          deo:numOrNull('ir_deo')||0,rad:numOrNull('ir_rad')||0,
          postarina:numOrNull('ir_postarina')||0,povracaj:numOrNull('ir_povracaj')||0,
          status:val('ir_status'),napomena:val('ir_napomena')}})});
    status('irStatus',r.message,'ok');
    idemGotovo('reklIzmeni');
    setTimeout(()=>{zatvoriIzmenuReklamacije();loadHistory();
      cuvanjeUToku=false;zakljucajDugmad(false);},900);
  }catch(e){
    status('irStatus',e.message,'error');
    cuvanjeUToku=false; zakljucajDugmad(false);
  }
}

async function obrisiReklamacijuIzmena(){
  if(!irId)return;
  if(!confirm('Obrisati ovu reklamaciju?'))return;
  status('irStatus','Brišem...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'reklamacijaObrisi',idem:idemKljuc('reklObrisi'),pin:localStorage.getItem('predatorPin'),
        id:irId,razlog:'Brisanje iz aplikacije'})});
    status('irStatus',r.message,'ok');
    idemGotovo('reklObrisi');
    setTimeout(()=>{zatvoriIzmenuReklamacije();loadHistory()},900);
  }catch(e){status('irStatus',e.message,'error')}
}

addEventListener('load',()=>{
  ['ir_deo','ir_rad','ir_postarina','ir_povracaj'].forEach(id=>{
    const e=$(id);
    if(e){
      e.addEventListener('input',osveziIrUkupno);
      e.addEventListener('blur',()=>{formatirajPolje(e);osveziIrUkupno()});
    }
  });
});


// ═══════════ STANJE LAGERA ═══════════
// Prikaz svima; unošenje stvarnog stanja samo vlasnik.
let stanjeSve=[];

function otvoriStanje(){
  if(prekidacKartice('stanjeCard'))return;
  $('stObjasnjenje').textContent = role==='owner'
    ? 'Upiši koliko STVARNO imaš na stanju. Stare prodaje se ne diraju — menja se samo stanje od sada.'
    : 'Trenutno stanje artikala.';
  const btn=$('stAkcije').querySelector('[data-owner]');
  if(btn){if(role==='owner')btn.classList.remove('hidden');else btn.classList.add('hidden')}
  setVal('st_pretraga','');
  $('stLista').innerHTML='<div class="empty">Učitavanje...</div>';
  hideStatus('stStatus');
  prikaziKarticu('stanjeCard');
  $('stanjeCard').scrollIntoView({behavior:'smooth'});
  api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'stanje',pin:localStorage.getItem('predatorPin')})})
    .then(r=>{stanjeSve=r.stavke||[];renderStanje();})
    .catch(e=>{$('stLista').innerHTML='';status('stStatus',e.message,'error')});
}

function zatvoriStanje(){ nazadNaPocetnu(); }

function renderStanje(){
  const q=(val('st_pretraga')||'').toLowerCase().trim();
  const lista=q?stanjeSve.filter(x=>(x.naziv+' '+x.grupa).toLowerCase().includes(q)):stanjeSve;
  const c=$('stLista');
  if(!lista.length){c.innerHTML='<div class="empty">Nema artikala.</div>';return}
  const maxL=Math.max(1,...lista.map(x=>Math.max(0,x.naStanju||0)));
  c.innerHTML=lista.map(x=>{
    const kl=x.naStanju<0?'minus':(x.naStanju===0?'nula':'ima');
    const desno = role==='owner'
      ? `<input type="number" inputmode="numeric" data-sku="${esc(x.sku)}" value="${x.naStanju}">`
      : `<span class="kom">${x.naStanju}</span>`;
    const pct=Math.round(Math.max(0,x.naStanju||0)/maxL*100);
    const malo=(x.naStanju||0)<=5?' malo':'';
    return `<div class="st-row ${kl}">
      <div class="nm">${esc(x.naziv)}<span class="gr">${x.naStanju} kom dostupno${x.naStanju<0?' · minus!':''}</span>
        <div class="lager-track"><div class="lager-fill${malo}" style="width:${pct}%"></div></div></div>
      ${desno}</div>`;
  }).join('');
}

async function sacuvajStanje(){
  if(role!=='owner'||cuvanjeUToku)return;
  const polja=[...document.querySelectorAll('#stLista input[data-sku]')];
  const stavke=[];
  polja.forEach(el=>{
    const sku=el.dataset.sku;
    const nova=Number(el.value);
    const stara=(stanjeSve.find(x=>x.sku===sku)||{}).naStanju;
    if(!isNaN(nova)&&nova!==stara)stavke.push({sku,stanje:nova});
  });
  if(!stavke.length){status('stStatus','Nisi promenio nijedno stanje.','warn');return}
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('stStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'stanjeSacuvaj',idem:idemKljuc('stanje'),pin:localStorage.getItem('predatorPin'),stavke})});
    status('stStatus',r.message,'ok');
    idemGotovo('stanje');
    const rr=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'stanje',pin:localStorage.getItem('predatorPin')})});
    stanjeSve=rr.stavke||[]; renderStanje();
  }catch(e){status('stStatus',e.message,'error')}
  cuvanjeUToku=false; zakljucajDugmad(false);
}

// ═══════════ NOVI ARTIKAL (samo vlasnik) ═══════════
const AR_POLJA=['ar_sku','ar_naziv','ar_grupaNova','ar_nabavnaEur','ar_nabavnaRsd',
  'ar_prodajnaEur','ar_prodajnaRsd','ar_stanje','ar_postarina','ar_garancija'];

function otvoriArtikal(){
  if(role!=='owner')return;
  if(prekidacKartice('artikalCard'))return;
  const sel=$('ar_grupa');
  const grupe=(initial&&initial.kategorije)||[];
  sel.innerHTML='<option value="">— izaberi grupu —</option>'+
    grupe.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')+
    '<option value="__nova__">＋ Nova grupa</option>';
  $('ar_grupaNova').classList.add('hidden');
  AR_POLJA.forEach(id=>setVal(id,''));
  $('ar_kursHint').textContent='Kurs: 1 € = '+kursEur+' RSD  ·  upiši jednu stranu, druga se sama računa';
  hideStatus('arStatus');
  prikaziKarticu('artikalCard');
  $('artikalCard').scrollIntoView({behavior:'smooth'});
}
function zatvoriArtikal(){ nazadNaPocetnu(); }
function artikalGrupaPromena(){
  const nova=val('ar_grupa')==='__nova__';
  $('ar_grupaNova').classList.toggle('hidden',!nova);
  if(nova)$('ar_grupaNova').focus();
}
// EUR ↔ RSD preračun (po trenutnom kursu)
function arNabavnaIzEur(){const e=numOrNull('ar_nabavnaEur');setVal('ar_nabavnaRsd',e?fmt(Math.round(e*kursEur)):'')}
function arNabavnaIzRsd(){const r=numOrNull('ar_nabavnaRsd');setVal('ar_nabavnaEur',r?fmt(Math.round(r/kursEur*100)/100):'')}
function arProdajnaIzEur(){const e=numOrNull('ar_prodajnaEur');setVal('ar_prodajnaRsd',e?fmt(Math.round(e*kursEur)):'')}
function arProdajnaIzRsd(){const r=numOrNull('ar_prodajnaRsd');setVal('ar_prodajnaEur',r?fmt(Math.round(r/kursEur*100)/100):'')}

async function sacuvajArtikal(){
  if(role!=='owner'||cuvanjeUToku)return;
  const sku=val('ar_sku').trim();
  const naziv=val('ar_naziv').trim();
  let grupa=val('ar_grupa');
  if(grupa==='__nova__')grupa=val('ar_grupaNova').trim();
  if(!sku){status('arStatus','Upiši šifru artikla (SKU).','warn');return}
  if(!naziv){status('arStatus','Upiši naziv artikla.','warn');return}
  if(!grupa){status('arStatus','Izaberi ili upiši grupu.','warn');return}
  const prodajnaRsd=numOrNull('ar_prodajnaRsd');
  if(prodajnaRsd===null||prodajnaRsd<=0){status('arStatus','Upiši prodajnu cenu (EUR ili RSD).','warn');return}
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('arStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'proizvodDodaj',idem:idemKljuc('artikal'),pin:localStorage.getItem('predatorPin'),
        data:{sku,naziv,grupa,
          nabavna_eur:numOrNull('ar_nabavnaEur')||0,
          nabavna_rsd:numOrNull('ar_nabavnaRsd')||0,
          prodajna_eur:numOrNull('ar_prodajnaEur')||0,
          prodajna_rsd:prodajnaRsd,
          pocetno_stanje:numOrNull('ar_stanje')||0,
          postarina_rsd:numOrNull('ar_postarina')||0,
          garancija_dana:numOrNull('ar_garancija')||0}})});
    status('arStatus',(r&&r.message)||'Artikal sačuvan.','ok');
    idemGotovo('artikal');
    // osveži katalog da nov artikal odmah uđe u prodaju/stanje/pregled
    const rr=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'initial',pin:localStorage.getItem('predatorPin')})});
    if(rr){initial=rr; buildSelects();}
    // očisti polja (grupa ostaje radi brzog niza unosa)
    AR_POLJA.filter(id=>id!=='ar_grupaNova').forEach(id=>setVal(id,''));
    $('ar_sku').focus();
  }catch(e){status('arStatus',e.message,'error')}
  cuvanjeUToku=false; zakljucajDugmad(false);
}

// ═══════════ PODEŠAVANJA: KURS (samo vlasnik) ═══════════
function otvoriPodesavanja(){
  if(role!=='owner')return;
  if(prekidacKartice('podesavanjaCard'))return;
  setVal('ps_kurs',kursEur);
  firmaPrefill();
  hideStatus('psStatus'); hideStatus('psFirmaStatus');
  prikaziKarticu('podesavanjaCard');
  $('podesavanjaCard').scrollIntoView({behavior:'smooth'});
}
function zatvoriPodesavanja(){ nazadNaPocetnu(); }

function firmaPrefill(){
  const f=(initial&&initial.firma)||{};
  setVal('ps_nazivFirme',f.nazivFirme||'');
  setVal('ps_pib',f.pib||'');
  setVal('ps_maticni',f.maticni||'');
  setVal('ps_ulica',f.ulica||'');
  setVal('ps_grad',f.grad||'');
  setVal('ps_email',f.email||'');
  setVal('ps_telefon',f.telefon||'');
  setVal('ps_knjIme',f.knjigovodjaIme||'');
  setVal('ps_knjEmail',f.knjigovodjaEmail||'');
  setVal('ps_slanjeMod',(f.slanjeMod||'podsetnik').toLowerCase()==='auto'?'auto':'podsetnik');
  setVal('ps_stagingEmail',f.stagingTestEmail||'');
  slanjeModPromena();
  pibHint();
}
function slanjeModPromena(){
  const auto=val('ps_slanjeMod')==='auto';
  const h=$('ps_autoHint'); if(h)h.classList.toggle('hidden',!auto);
}
function pibHint(){
  const el=$('ps_pibHint'); if(!el)return;
  const cifre=(val('ps_pib')||'').replace(/\D/g,'');
  if(!cifre){el.textContent='';el.style.color='';return}
  if(cifre.length===9){el.textContent='✓ PIB format u redu';el.style.color='var(--green-l)';}
  else{el.textContent='⚠ PIB treba 9 cifara (trenutno '+cifre.length+')';el.style.color='var(--amber-l)';}
}
async function sacuvajFirmu(){
  if(role!=='owner'||cuvanjeUToku)return;
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('psFirmaStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'firmaSacuvaj',idem:idemKljuc('firma'),pin:localStorage.getItem('predatorPin'),
        data:{
          nazivFirme:val('ps_nazivFirme').trim(),
          pib:val('ps_pib'),
          maticni:val('ps_maticni'),
          ulica:val('ps_ulica').trim(),
          grad:val('ps_grad').trim(),
          email:val('ps_email').trim(),
          telefon:val('ps_telefon').trim(),
          knjigovodjaIme:val('ps_knjIme').trim(),
          knjigovodjaEmail:val('ps_knjEmail').trim(),
          slanjeMod:val('ps_slanjeMod')||'podsetnik',
          stagingTestEmail:val('ps_stagingEmail').trim()
        }})});
    if(r&&r.firma&&initial)initial.firma=r.firma;
    status('psFirmaStatus',(r&&r.message)||'Sačuvano.',(r&&r.pibUpozorenje)?'warn':'ok');
    idemGotovo('firma');
    if(r&&r.firma){setVal('ps_pib',r.firma.pib||'');setVal('ps_maticni',r.firma.maticni||'');pibHint();}
  }catch(e){status('psFirmaStatus',e.message,'error')}
  cuvanjeUToku=false; zakljucajDugmad(false);
}
async function sacuvajKurs(){
  if(role!=='owner'||cuvanjeUToku)return;
  const k=numOrNull('ps_kurs');
  if(k===null||k<=0){status('psStatus','Upiši važeći kurs (broj veći od 0).','warn');return}
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('psStatus','Čuvanje...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'kursSacuvaj',idem:idemKljuc('kurs'),pin:localStorage.getItem('predatorPin'),kurs:k})});
    kursEur=(r&&r.kurs)||k;
    if(initial)initial.kursEur=kursEur;
    status('psStatus',(r&&r.message)||'Kurs sačuvan.','ok');
    idemGotovo('kurs');
  }catch(e){status('psStatus',e.message,'error')}
  cuvanjeUToku=false; zakljucajDugmad(false);
}

// ═══════════════════════════ MODUL RAČUNI ═══════════════════════════
// Skeniranje fiskalnog računa (QR) → backend povlači podatke sa PURS-a.
// Offline: adresa računa se čuva lokalno i obrađuje kad se vratiš online.

const RACUNI_PENDING_KEY='stanjeRacuniPending';
function pendingRacuni(){ try{return JSON.parse(localStorage.getItem(RACUNI_PENDING_KEY)||'[]')}catch(e){return[]} }
function snimiPending(lista){ try{localStorage.setItem(RACUNI_PENDING_KEY,JSON.stringify(lista))}catch(e){} }
function dodajPending(url){
  const l=pendingRacuni();
  if(!l.some(x=>x.url===url)){ l.push({url,ts:Date.now()}); snimiPending(l); }
  osveziPendingPrikaz();
}
function ukloniPending(url){ snimiPending(pendingRacuni().filter(x=>x.url!==url)); osveziPendingPrikaz(); }
function osveziPendingPrikaz(){
  const n=pendingRacuni().length;
  const badge=$('racuniPendingBadge');
  if(badge){ if(n>0){badge.textContent='• '+n+' na čekanju';badge.classList.remove('hidden');} else badge.classList.add('hidden'); }
  const box=$('racuniPending');
  if(box){
    if(n>0){
      box.classList.remove('hidden');
      box.innerHTML=`<div class="status warn" style="display:block;margin-bottom:8px">⏳ ${n} račun(a) čeka obradu (bili ste offline).</div>`+
        `<button class="act ghost" style="width:100%" onclick="obradiPending()">Obradi račune na čekanju</button>`;
    } else box.classList.add('hidden');
  }
}

function otvoriRacuni(){
  if(role!=='owner')return;
  if(prekidacKartice('racuniCard'))return;
  osveziPendingPrikaz();
  prikaziKarticu('racuniCard');
  $('racuniCard').scrollIntoView({behavior:'smooth'});
  ucitajRacune();
}
function zatvoriRacuni(){ nazadNaPocetnu(); }

let _racuniList=[];
let _racFilter={mesec:'',status:'sve',q:''};
const _MESECI=['januar','februar','mart','april','maj','jun','jul','avgust','septembar','oktobar','novembar','decembar'];
function _mesecKljuc(d){ const m=String(d||'').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m?(m[3]+'-'+('0'+m[2]).slice(-2)):''; }
function _mesecNaziv(k){ const p=k.split('-'); return p.length===2?(_MESECI[Number(p[1])-1]+' '+p[0]):k; }

async function ucitajRacune(){
  const box=$('racuniLista'); if(!box)return;
  box.innerHTML='<div class="empty">Učitavanje...</div>';
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racunLista',pin:localStorage.getItem('predatorPin')})});
    _racuniList=(r&&r.racuni)||[];
    renderSlanje(_racuniList.filter(x=>!x.poslato).length);
    popuniMeseci();
    renderRacuniUI();
  }catch(e){ box.innerHTML='<div class="empty">Greška: '+esc(e.message)+'</div>'; }
}
function popuniMeseci(){
  const sel=$('racMesec'); if(!sel)return;
  const meseci=[...new Set(_racuniList.map(x=>_mesecKljuc(x.datumRacuna)).filter(Boolean))].sort().reverse();
  const d=new Date(); const tek=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);
  if(!_racFilter.mesec) _racFilter.mesec = meseci.indexOf(tek)>=0?tek:'sve';
  if(_racFilter.mesec!=='sve' && meseci.indexOf(_racFilter.mesec)<0) _racFilter.mesec='sve';
  sel.innerHTML='<option value="sve">Svi meseci</option>'+meseci.map(m=>`<option value="${m}">${esc(_mesecNaziv(m))}</option>`).join('');
  sel.value=_racFilter.mesec;
}
function racMesecPromena(){ _racFilter.mesec=$('racMesec').value; renderRacuniUI(); }
function racChip(status){ _racFilter.status=status; renderRacuniUI(); }

function renderRacuniUI(){
  const box=$('racuniLista'); if(!box)return;
  const preg=$('racuniPregled'), fil=$('racuniFilteri');
  if(!_racuniList.length){
    if(preg)preg.classList.add('hidden'); if(fil)fil.classList.add('hidden');
    box.innerHTML='<div class="empty">Još nema sačuvanih računa.</div>'; return;
  }
  if(fil)fil.classList.remove('hidden');
  _racFilter.q=(val('racPretraga')||'').toLowerCase().trim();
  const uMesecu = _racFilter.mesec==='sve' ? _racuniList : _racuniList.filter(x=>_mesecKljuc(x.datumRacuna)===_racFilter.mesec);
  // PREGLED
  if(preg){
    const skenirano=uMesecu.length;
    const troskovi=uMesecu.filter(x=>x.trosak);
    const poslato=uMesecu.filter(x=>x.poslato).length;
    const sumaTrosak=troskovi.reduce((s,x)=>s+(x.iznos||0),0);
    preg.classList.remove('hidden');
    preg.innerHTML=
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
      _pregKocka('Skenirano',skenirano)+_pregKocka('Troškovi',troskovi.length)+
      _pregKocka('Arhiva',skenirano-troskovi.length)+_pregKocka('Poslato',poslato)+
      _pregKocka('Čeka',skenirano-poslato)+'</div>'+
      (sumaTrosak>0 ? '<div style="margin-top:8px;font-size:14px">Poslovni trošak: <b>'+fmtCela(sumaTrosak)+' RSD</b></div>' : '');
  }
  renderChips();
  // LISTA (mesec + status + pretraga)
  let l=uMesecu.slice(); const st=_racFilter.status;
  if(st==='trosak')l=l.filter(x=>x.trosak);
  else if(st==='arhiva')l=l.filter(x=>!x.trosak);
  else if(st==='poslato')l=l.filter(x=>x.poslato);
  else if(st==='neposlato')l=l.filter(x=>!x.poslato);
  if(_racFilter.q)l=l.filter(x=>((x.prodavac||'')+' '+(x.pibKupca||'')+' '+(x.pibProdavca||'')+' '+(x.pfrBroj||'')+' '+(x.iznos||'')).toLowerCase().indexOf(_racFilter.q)>=0);
  if(!l.length){ box.innerHTML='<div class="empty">Nema računa za ovaj filter.</div>'; return; }
  box.innerHTML='<div class="sec-title">Računi ('+l.length+')</div>'+l.map(renderRacunRed).join('');
}
function _pregKocka(lbl,vr){
  return '<div style="flex:1;min-width:56px;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:8px 4px;text-align:center">'+
    '<div style="font-size:20px;font-weight:700">'+vr+'</div><div class="small" style="color:var(--muted)">'+lbl+'</div></div>';
}
function renderChips(){
  const box=$('racChips'); if(!box)return;
  const opcije=[['sve','Svi'],['trosak','Trošak'],['arhiva','Arhiva'],['neposlato','Neoposlato'],['poslato','Poslato']];
  box.innerHTML=opcije.map(function(o){
    const akt=_racFilter.status===o[0];
    const stil=akt?'background:var(--green-d);color:var(--green-l);border-color:var(--green)':'background:var(--card2);color:var(--muted2);border-color:var(--line)';
    return '<span onclick="racChip(\''+o[0]+'\')" style="cursor:pointer;padding:6px 12px;border-radius:16px;border:1px solid;font-size:13px;'+stil+'">'+o[1]+'</span>';
  }).join('');
}
function renderSlanje(n){
  const box=$('racuniSlanje'); if(!box)return;
  if(!n){ box.classList.add('hidden'); box.innerHTML=''; return; }
  box.classList.remove('hidden');
  const dan=new Date().getDate();
  const podseti = dan<=7 ? '<div class="status warn" style="display:block;margin-bottom:8px">⏰ Početak meseca — vreme je da pošalješ račune knjigovođi.</div>' : '';
  box.innerHTML=podseti+'<button class="act primary" style="width:100%" onclick="otvoriPosalji()"><i class="ti ti-send"></i> Pošalji knjigovođi ('+n+')</button>';
}
async function otvoriPosalji(){
  if(role!=='owner')return;
  zatvoriSveKartice('posaljiCard');
  prikaziKarticu('posaljiCard');
  $('poSadrzaj').innerHTML='<div class="empty">Učitavanje...</div>';
  $('poPosaljiBtn').classList.add('hidden');
  hideStatus('poStatus');
  $('posaljiCard').scrollIntoView({behavior:'smooth'});
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racuniZaSlanje',pin:localStorage.getItem('predatorPin')})});
    if(!r.knjigovodjaEmail){ $('poSadrzaj').innerHTML='<div class="status warn" style="display:block">Prvo unesi email knjigovođe u Podešavanja.</div>'; return; }
    if(!r.broj){ $('poSadrzaj').innerHTML='<div class="empty">Nema neoposlatih računa.</div>'; return; }
    const pc=r.poCategoriji||{};
    const cats=Object.keys(pc).map(k=>`<div class="st-row ima"><div class="nm">${esc(k)}</div><span class="kom">${fmtCela(pc[k])}</span></div>`).join('');
    $('poSadrzaj').innerHTML=
      '<div style="font-size:16px;margin-bottom:4px"><b>'+r.broj+' računa</b> · ukupno <b>'+fmtCela(r.total)+' RSD</b></div>'+
      '<div class="small" style="color:var(--muted);margin-bottom:10px">Prima: '+esc(r.knjigovodjaEmail)+'</div>'+
      (cats?('<div class="sec-title">Po kategoriji</div>'+cats):'');
    $('poPosaljiBtn').classList.remove('hidden');
    $('poPosaljiBtn').textContent='Pošalji '+r.broj+' računa';
  }catch(e){ $('poSadrzaj').innerHTML=''; status('poStatus',e.message,'error'); }
}
function zatvoriPosalji(){ nazadNaPocetnu(); }
async function posaljiKnjigovodji(){
  if(role!=='owner'||cuvanjeUToku)return;
  if(!confirm('Poslati račune knjigovođi mejlom?'))return;
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('poStatus','Šaljem mejl...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racuniPosalji',idem:idemKljuc('posalji'),pin:localStorage.getItem('predatorPin')})});
    idemGotovo('posalji');
    status('poStatus',(r&&r.message)||'Poslato.','ok');
    setTimeout(()=>{ zatvoriPosalji(); otvoriRacuni(); },1300);
  }catch(e){ status('poStatus',e.message,'error'); }
  cuvanjeUToku=false; zakljucajDugmad(false);
}
function renderRacunRed(x){
  const pib = x.pibStatus==='POTVRĐEN' ? '<span style="color:var(--green-l)">✓ PIB</span>'
    : (x.pibStatus==='DRUGI' ? '<span style="color:var(--amber-l)">⚠ dr.PIB</span>'
    : '<span style="color:var(--muted)">PIB ?</span>');
  const trosak = x.trosak ? '<span style="color:var(--green-l)">trošak</span>' : '<span style="color:var(--muted)">arhiva</span>';
  const dat = String(x.datumRacuna||'').split(' ')[0]||'';
  const naziv=(x.prodavac||'').slice(0,42);
  return `<div class="st-row ima" style="cursor:pointer" onclick="otvoriRacunIzListe('${esc(x.id)}')"><div class="nm">${esc(naziv)}<span class="gr">${dat} · ${pib} · ${trosak}</span></div><span class="kom">${fmtCela(x.iznos||0)}</span></div>`;
}

async function odbaciRacun(){
  const rc=window._racun;
  if(!rc||!rc.id){ status('rpStatus','Ovaj račun nema ID (nije sačuvan).','warn'); return; }
  if(!confirm('Odbaciti ovaj račun? Neće se pojaviti u listi.'))return;
  status('rpStatus','Odbacujem...','warn');
  try{
    await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racunOdbaci',idem:idemKljuc('odbaci-'+rc.id),pin:localStorage.getItem('predatorPin'),id:rc.id})});
    idemGotovo('odbaci-'+rc.id);
    zatvoriRacunPregled();
    otvoriRacuni();
  }catch(e){ status('rpStatus',e.message,'error'); }
}

// ── Skener ──
let skenStream=null, skenRAF=null, skenBusy=false, skenTrack=null, skenDetector=null, torchOn=false, _zbarScanner=null;
async function otvoriSken(){
  if(role!=='owner')return;
  zatvoriSveKartice('skenCard');
  prikaziKarticu('skenCard');
  $('skenCard').scrollIntoView({behavior:'smooth'});
  hideStatus('skenStatus');
  await startKamera();
}
async function startKamera(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    status('skenStatus','Kamera nije podržana. Koristi „Otpremi sliku".','warn');return;
  }
  try{
    skenStream=await navigator.mediaDevices.getUserMedia({video:{
      facingMode:{ideal:'environment'},
      width:{ideal:1920}, height:{ideal:1080}, frameRate:{ideal:30},
      advanced:[{focusMode:'continuous'}]
    }});
    const v=$('skenVideo'); v.setAttribute('playsinline',''); v.srcObject=skenStream; await v.play();
    skenTrack=skenStream.getVideoTracks()[0];
    try{ await skenTrack.applyConstraints({advanced:[{focusMode:'continuous'}]}); }catch(e){}
    prikaziTorchDugme();
    // Native brzi čitač (Android Chrome) — robusniji za guste QR
    skenDetector=null;
    if('BarcodeDetector' in window){
      try{
        const fmts=await window.BarcodeDetector.getSupportedFormats();
        if(fmts.indexOf('qr_code')>=0) skenDetector=new window.BarcodeDetector({formats:['qr_code']});
      }catch(e){}
    }
    status('skenStatus','Tražim QR kod... približi dok ne popuni okvir.','warn');
    skenBusy=false; skenLoop();
  }catch(e){
    status('skenStatus','Nemam pristup kameri. Dozvoli kameru ili koristi „Otpremi sliku".','warn');
  }
}
// Petlja: što češće (rAF), ali bez preklapanja (skenBusy) — toliko brzo koliko dekoder stigne.
function skenLoop(){
  if(!skenStream)return;
  skenRAF=requestAnimationFrame(skenLoop);
  if(skenBusy)return;
  skenBusy=true;
  skenFrejm().then(function(data){
    if(data){ stopKamera(); obradiUrl(data); }
  }).catch(function(){}).finally(function(){ skenBusy=false; });
}
async function skenFrejm(){
  const v=$('skenVideo');
  if(!skenStream||v.readyState<2||!v.videoWidth)return null;
  // native brzi čitač (Android) — direktno na video
  if(skenDetector){ try{ const codes=await skenDetector.detect(v); if(codes&&codes.length)return codes[0].rawValue; }catch(e){} }
  // centar-krop = samo zeleni kvadrat (~66%), SMANJEN na ~640px (manja površina = brže + tačnije)
  const S=Math.floor(Math.min(v.videoWidth,v.videoHeight)*0.66);
  const sx=Math.floor((v.videoWidth-S)/2), sy=Math.floor((v.videoHeight-S)/2);
  const T=Math.min(S,640);
  const c=$('skenCanvas'); c.width=T; c.height=T;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(v,sx,sy,S,S,0,0,T,T);
  let img=null; try{ img=ctx.getImageData(0,0,T,T); }catch(e){ return null; }
  return await dekodirajImageData(img,true);
}

// ── NAJJAČI DEKODER: ZBar (WASM, samo QR = brže) → jsQR ──
async function zbarQrScanner(){
  if(_zbarScanner)return _zbarScanner;
  try{
    const Z=window.zbarWasm;
    if(!Z||!Z.getDefaultScanner)return null;
    const sc=await Z.getDefaultScanner();
    sc.setConfig(Z.ZBarSymbolType.ZBAR_NONE, Z.ZBarConfigType.ZBAR_CFG_ENABLE, 0);   // ugasi sve
    sc.setConfig(Z.ZBarSymbolType.ZBAR_QRCODE, Z.ZBarConfigType.ZBAR_CFG_ENABLE, 1); // samo QR
    _zbarScanner=sc;
  }catch(e){ _zbarScanner=null; }
  return _zbarScanner;
}
async function dekodirajImageData(img,brzo){
  if(!img)return null;
  try{
    if(window.zbarWasm){
      const sc=await zbarQrScanner();
      const s=await window.zbarWasm.scanImageData(img, sc||undefined);
      if(s&&s.length){ const t=s[0].decode(); if(t)return t; }
    }
  }catch(e){}
  if(brzo)return null;   // uživo: osloni se na ZBar po frejmu (jsQR štedi za slike)
  try{ const c=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'}); if(c&&c.data)return c.data; }catch(e){}
  return null;
}
function _naImageData(src,w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(src,0,0,w,h);
  return ctx.getImageData(0,0,w,h);
}
function _otsu(img){
  const d=img.data,N=img.width*img.height,g=new Uint8Array(N),h=new Array(256).fill(0);
  for(let i=0;i<N;i++){ const y=(d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114)|0; g[i]=y; h[y]++; }
  let sum=0; for(let i=0;i<256;i++)sum+=i*h[i];
  let sB=0,wB=0,mx=0,thr=127; for(let i=0;i<256;i++){ wB+=h[i]; if(!wB)continue; const wF=N-wB; if(!wF)break; sB+=i*h[i]; const mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)*(mB-mF); if(v>mx){mx=v;thr=i;} }
  const out=new Uint8ClampedArray(N*4);
  for(let i=0;i<N;i++){ const val=g[i]>thr?255:0; out[i*4]=out[i*4+1]=out[i*4+2]=val; out[i*4+3]=255; }
  return new ImageData(out,img.width,img.height);
}
// Proba sliku kroz više obrada (puna, uvećana, crno-bela Otsu) dok jedna ne pročita
async function dekodirajSliku(imgEl){
  const W=imgEl.naturalWidth||imgEl.width, H=imgEl.naturalHeight||imgEl.height;
  if(!W||!H)return null;
  const scales=[Math.min(1,2000/Math.max(W,H)), Math.min(2.5,3200/Math.max(W,H))];
  const vidjene=new Set();
  for(const s of scales){
    const w=Math.max(1,Math.round(W*s)), h=Math.max(1,Math.round(H*s));
    const kljuc=w+'x'+h; if(vidjene.has(kljuc))continue; vidjene.add(kljuc);
    let vd=null; try{ vd=_naImageData(imgEl,w,h); }catch(e){ continue; }
    let d=await dekodirajImageData(vd); if(d)return d;
    try{ d=await dekodirajImageData(_otsu(vd)); if(d)return d; }catch(e){}
  }
  return null;
}
function stopKamera(){
  if(skenRAF){cancelAnimationFrame(skenRAF);skenRAF=null;}
  skenBusy=false;
  if(skenStream){skenStream.getTracks().forEach(t=>t.stop());skenStream=null;}
  skenTrack=null; skenDetector=null; torchOn=false;
  const v=$('skenVideo'); if(v)v.srcObject=null;
  const tb=$('torchBtn'); if(tb)tb.classList.add('hidden');
}
function prikaziTorchDugme(){
  const tb=$('torchBtn'); if(!tb)return;
  let ok=false;
  try{ const caps=skenTrack&&skenTrack.getCapabilities&&skenTrack.getCapabilities(); if(caps&&caps.torch)ok=true; }catch(e){}
  tb.textContent='🔦 Upali svetlo';
  if(ok)tb.classList.remove('hidden'); else tb.classList.add('hidden');
}
async function toggleTorch(){
  if(!skenTrack)return;
  try{
    torchOn=!torchOn;
    await skenTrack.applyConstraints({advanced:[{torch:torchOn}]});
    const tb=$('torchBtn'); if(tb)tb.textContent=torchOn?'🔦 Ugasi svetlo':'🔦 Upali svetlo';
  }catch(e){}
}
function zatvoriSken(){ stopKamera(); nazadNaPocetnu(); }

function skenIzFajla(ev){
  const f=ev.target.files&&ev.target.files[0]; if(!f)return;
  status('skenStatus','Čitam sliku (najjači režim)...','warn');
  const img=new Image();
  img.onload=async function(){
    let data=null; try{ data=await dekodirajSliku(img); }catch(e){}
    URL.revokeObjectURL(img.src);
    if(data){ stopKamera(); obradiUrl(data); }
    else status('skenStatus','QR nije pročitan. Probaj jasnije/bliže, bolje osvetljenje, ili uživo kamerom.','warn');
  };
  img.onerror=function(){status('skenStatus','Ne mogu da otvorim sliku.','error');};
  img.src=URL.createObjectURL(f);
  ev.target.value='';
}

async function obradiUrl(url){
  if(!/suf\.purs\.gov\.rs/.test(String(url))){
    status('skenStatus','QR nije fiskalni račun (očekujem suf.purs.gov.rs).','warn');
    await startKamera(); return;
  }
  if(!navigator.onLine){
    dodajPending(url);
    status('skenStatus','📴 Nema interneta — račun sačuvan, obradiće se kad budeš online.','warn');
    return;
  }
  status('skenStatus','Čuvam račun...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racunSacuvaj',idem:idemKljuc('racun-'+url),pin:localStorage.getItem('predatorPin'),url})});
    ukloniPending(url);
    idemGotovo('racun-'+url);
    prikaziRacun(r.racun,r);
  }catch(e){
    // mrežni pad → čuvamo za kasnije da se ne izgubi
    if(/Load failed|Failed to fetch|NetworkError|Greška servera/i.test(e.message||'')){
      dodajPending(url);
      status('skenStatus','Veza je pukla — račun sačuvan za kasnije. Probaj „Obradi na čekanju".','warn');
    } else {
      status('skenStatus',e.message,'error');
    }
  }
}

async function obradiPending(){
  if(!navigator.onLine){ alert('Još uvek si offline. Probaj kad dobiješ internet.'); return; }
  const l=pendingRacuni();
  if(!l.length)return;
  const url=l[0].url;
  status('skenStatus','Obrađujem račun na čekanju...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racunSacuvaj',idem:idemKljuc('racun-'+url),pin:localStorage.getItem('predatorPin'),url})});
    ukloniPending(url);
    idemGotovo('racun-'+url);
    prikaziRacun(r.racun,r);
  }catch(e){ status('skenStatus',e.message,'error'); }
}

function prikaziRacun(rc,meta){
  meta=meta||{};
  rc=rc||{};
  rc.id=meta.id||rc.id||null;
  window._racun=rc;
  stopKamera();
  zatvoriSveKartice('racunPregledCard');
  // oznaka da je sačuvano / upozorenje za duplikat
  const sv=$('rpSaved');
  if(sv){
    if(meta.duplikat){ sv.textContent='❗ Ovaj račun je već skeniran'; sv.style.color='var(--red-l)'; sv.style.fontSize='15px'; }
    else if(meta.vecSacuvan){ sv.textContent='Sačuvan račun'; sv.style.color='var(--muted2)'; sv.style.fontSize=''; }
    else { sv.textContent='✓ Sačuvano u Računi'; sv.style.color='var(--green-l)'; sv.style.fontSize=''; }
  }
  // iznos (heroj)
  $('rpIznos').textContent=fmtCela(rc.ukupno||0)+' RSD';
  // skraćen naziv prodavca
  $('rpProdavac').textContent=skratiProdavca(rc.prodavac||'');
  // meta: datum i vreme · način plaćanja
  const ml=[];
  const dv=_fmtDatumVreme(rc.pfrVreme); if(dv)ml.push(dv);
  if(rc.nacinPlacanja)ml.push(rc.nacinPlacanja);
  $('rpMeta').textContent=ml.join(' · ');
  // kategorije (jednom napuni)
  const sel=$('rpKategorija');
  if(sel && !sel._puno){ const kats=(initial&&initial.costCategories)||[]; sel.innerHTML=kats.map(k=>`<option>${esc(k)}</option>`).join(''); sel._puno=true; }
  // PIB status (provera da li je izdat na vašu firmu)
  const mojPib=(initial&&initial.firma&&initial.firma.pib)||'';
  const pel=$('rpPib');
  if(pel){
    let cls,txt;
    if(!mojPib){cls='warn';txt='⚠ Unesi PIB firme u Podešavanja';}
    else if(!rc.pibKupca){cls='warn';txt='⚠ PIB kupca nije na računu';}
    else if(String(rc.pibKupca)===String(mojPib)){cls='ok';txt='✓ Račun je izdat na vašu firmu';}
    else {cls='warn';txt='⚠ Drugi PIB: '+rc.pibKupca;}
    const stil=(cls==='ok')?'background:var(--green-d);color:var(--green-l)':'background:var(--amber-bg);color:var(--amber-l)';
    pel.innerHTML='<span style="display:inline-block;padding:7px 13px;border-radius:20px;font-size:13px;font-weight:600;'+stil+'">'+txt+'</span>';
  }
  // status slanja + prekini edit
  $('rpEditBox').classList.add('hidden');
  setVal('rpEditProdavac',rc.prodavac||''); setVal('rpEditIznos',rc.ukupno||''); setVal('rpEditPdv',rc.pdv||'');
  const po=$('rpPoslato'), pb=$('rpPosaljiBtn');
  if(rc.poslato){ if(po){po.style.color='var(--green-l)';po.textContent='✓ Poslato knjigovođi'+(rc.datumSlanja?' · '+_kratakDatum(rc.datumSlanja):'');} if(pb)pb.innerHTML='<i class="ti ti-send"></i> Pošalji ponovo'; }
  else { if(po){po.style.color='var(--muted)';po.textContent='Nije poslato knjigovođi';} if(pb)pb.innerHTML='<i class="ti ti-send"></i> Pošalji knjigovođi'; }
  setVal('rpNapomena', rc.napomena||'');
  _rpTrosak=!!rc.trosak;
  if(rc.trosak && rc.kategorija)setVal('rpKategorija',rc.kategorija);
  updateTrosakUI();
  hideStatus('rpStatus');
  prikaziKarticu('racunPregledCard');
  $('racunPregledCard').scrollIntoView({behavior:'smooth'});
}
function _kratakDatum(d){ try{ const x=new Date(d); if(isNaN(x))return String(d); return ('0'+x.getDate()).slice(-2)+'.'+('0'+(x.getMonth()+1)).slice(-2)+'.'+x.getFullYear(); }catch(e){return String(d);} }
// Datum+vreme u čist oblik „08.08.2026. 11:28" (radi i za srpski tekst i za JS/ISO datum)
function _fmtDatumVreme(v){
  if(!v) return '';
  const s=String(v);
  const m=s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*(\d{1,2}):(\d{2})/);   // "08.08.2026. 11:28:41"
  if(m) return ('0'+m[1]).slice(-2)+'.'+('0'+m[2]).slice(-2)+'.'+m[3]+'. '+('0'+m[4]).slice(-2)+':'+m[5];
  const d=new Date(v);
  if(!isNaN(d)) return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.'+d.getFullYear()+'. '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  return s;
}
function rpToggleEdit(){ $('rpEditBox').classList.toggle('hidden'); }
async function racunSacuvajIzmenu(){
  const rc=window._racun; if(!rc||!rc.id)return;
  const izmene={ prodavac:val('rpEditProdavac').trim(), iznos:numOrNull('rpEditIznos'), pdv:numOrNull('rpEditPdv') };
  status('rpStatus','Čuvam ispravku...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racunIzmeni',idem:idemKljuc('izm-'+rc.id+'-'+Date.now()),pin:localStorage.getItem('predatorPin'),id:rc.id,izmene:izmene})});
    // osveži prikaz lokalno
    if(izmene.prodavac)rc.prodavac=izmene.prodavac;
    if(izmene.iznos!=null)rc.ukupno=izmene.iznos;
    if(izmene.pdv!=null)rc.pdv=izmene.pdv;
    $('rpIznos').textContent=fmtCela(rc.ukupno||0)+' RSD';
    $('rpProdavac').textContent=skratiProdavca(rc.prodavac||'');
    $('rpEditBox').classList.add('hidden');
    status('rpStatus',(r&&r.message)||'Ispravljeno.','ok');
  }catch(e){ status('rpStatus',e.message,'error'); }
}
async function posaljiJedan(){
  const rc=window._racun; if(!rc||!rc.id){ status('rpStatus','Račun nema ID.','warn'); return; }
  if(cuvanjeUToku)return;
  if(!confirm(rc.poslato?'Ponovo poslati ovaj račun knjigovođi?':'Poslati ovaj račun knjigovođi?'))return;
  cuvanjeUToku=true; zakljucajDugmad(true);
  status('rpStatus','Šaljem...','warn');
  try{
    const r=await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racunPosaljiJedan',idem:idemKljuc('poj-'+rc.id+'-'+Date.now()),pin:localStorage.getItem('predatorPin'),id:rc.id})});
    rc.poslato=true; rc.datumSlanja=new Date().toISOString();
    const po=$('rpPoslato'); if(po){po.style.color='var(--green-l)';po.textContent='✓ Poslato knjigovođi · '+_kratakDatum(rc.datumSlanja);}
    $('rpPosaljiBtn').innerHTML='<i class="ti ti-send"></i> Pošalji ponovo';
    status('rpStatus',(r&&r.message)||'Poslato.','ok');
  }catch(e){ status('rpStatus',e.message,'error'); }
  cuvanjeUToku=false; zakljucajDugmad(false);
}
function skenIzLinka(){
  const u=(val('skenLink')||'').trim();
  if(!u){ status('skenStatus','Nalepi link sa računa.','warn'); return; }
  stopKamera();
  obradiUrl(u);
}
let _rpTrosak=false;
function updateTrosakUI(){
  const b=$('rpTrosakBtn'), box=$('rpKatBox'), info=$('rpTrosakInfo');
  if(!b)return;
  box.classList.toggle('hidden',!_rpTrosak);
  if(_rpTrosak){
    b.textContent='✓ Trošak'; b.style.background='var(--green-d)'; b.style.color='var(--green-l)'; b.style.borderColor='var(--green)';
  } else {
    b.textContent='Trošak'; b.style.background=''; b.style.color=''; b.style.borderColor='';
  }
  if(info)info.classList.add('hidden');
}
// Automatsko čuvanje — bez dugmeta „Sačuvaj"
async function rpToggleTrosak(){ _rpTrosak=!_rpTrosak; updateTrosakUI(); await _sacTrosak(); }
async function rpKategorijaPromena(){ if(_rpTrosak) await _sacTrosak(); }
async function _sacTrosak(){
  const rc=window._racun; if(!rc||!rc.id)return;
  status('rpStatus',_rpTrosak?'Upisujem trošak...':'Uklanjam...','warn');
  try{
    if(_rpTrosak){
      const kat=val('rpKategorija')||'Ostalo';
      await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'racunTrosak',idem:idemKljuc('tr-'+rc.id+'-'+Date.now()),pin:localStorage.getItem('predatorPin'),id:rc.id,trosak:true,kategorija:kat})});
      rc.trosak=true; rc.kategorija=kat; status('rpStatus','✓ Upisano u troškove ('+kat+')','ok');
    } else if(rc.trosak){
      await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'racunTrosak',idem:idemKljuc('tr-'+rc.id+'-'+Date.now()),pin:localStorage.getItem('predatorPin'),id:rc.id,trosak:false})});
      rc.trosak=false; rc.kategorija=''; status('rpStatus','Samo arhiva','ok');
    } else { hideStatus('rpStatus'); }
  }catch(e){ status('rpStatus',e.message,'error'); _rpTrosak=!!rc.trosak; updateTrosakUI(); }
}
async function rpNapomenaBlur(){
  const rc=window._racun; if(!rc||!rc.id)return;
  const txt=val('rpNapomena')||''; if(txt===(rc.napomena||''))return;
  try{
    await api('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'racunNapomena',idem:idemKljuc('np-'+rc.id+'-'+Date.now()),pin:localStorage.getItem('predatorPin'),id:rc.id,napomena:txt})});
    rc.napomena=txt; status('rpStatus','Napomena sačuvana','ok');
  }catch(e){ status('rpStatus',e.message,'error'); }
}
function otvoriRacunIzListe(id){
  const x=(_racuniList||[]).find(r=>r.id===id); if(!x)return;
  prikaziRacun({ id:x.id, ukupno:x.iznos, prodavac:x.prodavac, pibKupca:x.pibKupca,
    pfrVreme:x.datumRacuna, nacinPlacanja:x.placanje, pdv:x.pdv||0, stopa:x.stopa||'', stavke:[],
    trosak:x.trosak, kategorija:x.kategorija, napomena:x.napomena,
    poslato:x.poslato, datumSlanja:x.datumSlanja }, {id:x.id,vecSacuvan:true});
}
// Skraćen naziv prodavca (npr. „GRADIS CENTAR DOO" iz dugačkog punog naziva)
function skratiProdavca(naziv){
  let s=String(naziv||'').replace(/\s+/g,' ').trim();
  if(!s)return '';
  const rec=s.split(' ');
  const formeRe=/^(DOO|D\.?O\.?O\.?|AD|PR|SZR|STR|SUR|SZTR|ZR|OD|SR|DOOEL)\.?$/i;
  let idx=-1;
  for(let i=0;i<rec.length;i++){ if(formeRe.test(rec[i])){ idx=i; break; } }
  if(idx>=0){
    if(idx<=1) return rec.slice(idx,idx+4).join(' ');       // forma na početku (PR ...)
    return rec.slice(Math.max(0,idx-2),idx+1).join(' ');     // 2 reči pre forme + forma
  }
  const kratko=rec.slice(0,4).join(' ');
  return kratko.length>34?kratko.slice(0,34)+'…':kratko;
}
function skenPonovo(){ $('racunPregledCard').classList.add('hidden'); otvoriSken(); }
function zatvoriRacunPregled(){ nazadNaPocetnu(); }

// kad se vrati internet — podseti da ima računa na čekanju
addEventListener('online',()=>{ if(pendingRacuni().length)osveziPendingPrikaz(); });
addEventListener('load',()=>{ try{osveziPendingPrikaz()}catch(e){} });
