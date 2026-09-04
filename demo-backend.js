/* ═══════════════════════════════════════════════════════════════════════
   STANJE — DEMO backend (radi u pregledaču, bez prave tabele).
   Presreće sve pozive ka /api/backend i vraća IZMIŠLJENE podatke.
   Nijedna prava poslovna brojka se ne prikazuje. Sve je demo.
   Pokriva: prodaja, troškovi, reklamacije, lager, kapara, povrat,
            novi artikal, podešavanja (firma+kurs) i MODUL RAČUNI.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var STORE_KEY = 'stanjeDemoStore_v7';

  // ── Izmišljeni katalog (ATV / dirt bike / skuteri / delovi / oprema) ──
  var CATALOG = [
    {sku:'ATV-PRD125', name:'ATV Predator 125cc', grupa:'ATV / Quad',   defaultPriceRsd:189000, nabavnaRsd:103000, baseStock:4},
    {sku:'ATV-GRZ200', name:'ATV Grizzly 200cc',  grupa:'ATV / Quad',   defaultPriceRsd:259000, nabavnaRsd:142000, baseStock:3},
    {sku:'ATV-KID49',  name:'ATV dečiji 49cc',    grupa:'ATV / Quad',   defaultPriceRsd:74900,  nabavnaRsd:40500,  baseStock:6},
    {sku:'DB-CROSS125',name:'Dirt bike Cross 125', grupa:'Dirt bike',    defaultPriceRsd:149000, nabavnaRsd:81000,  baseStock:5},
    {sku:'DB-END250',  name:'Dirt bike Enduro 250',grupa:'Dirt bike',    defaultPriceRsd:329000, nabavnaRsd:182000, baseStock:2},
    {sku:'DB-PIT110',  name:'Pit bike 110cc',      grupa:'Dirt bike',    defaultPriceRsd:99900,  nabavnaRsd:54000,  baseStock:7},
    {sku:'SK-URB50',   name:'Skuter Urban 50cc',   grupa:'Skuteri',      defaultPriceRsd:149900, nabavnaRsd:81500,  baseStock:4},
    {sku:'SK-CITY125', name:'Skuter City 125cc',   grupa:'Skuteri',      defaultPriceRsd:219000, nabavnaRsd:120000, baseStock:3},
    {sku:'DEO-LANAC',  name:'Lanac 428',           grupa:'Delovi',       defaultPriceRsd:1890,   nabavnaRsd:820,    baseStock:40, postarinaRsd:420},
    {sku:'DEO-KARB',   name:'Karburator PZ27',     grupa:'Delovi',       defaultPriceRsd:3490,   nabavnaRsd:1520,   baseStock:15, postarinaRsd:420},
    {sku:'DEO-PLOC',   name:'Kočione pločice',     grupa:'Delovi',       defaultPriceRsd:1290,   nabavnaRsd:540,    baseStock:30, postarinaRsd:350},
    {sku:'DEO-FILTER', name:'Filter vazduha',      grupa:'Delovi',       defaultPriceRsd:890,    nabavnaRsd:360,    baseStock:25, postarinaRsd:350},
    {sku:'DEO-AKU',    name:'Akumulator 12V',      grupa:'Delovi',       defaultPriceRsd:4990,   nabavnaRsd:2380,   baseStock:12, postarinaRsd:600},
    {sku:'OPR-KACIGA', name:'Kaciga Cross M',      grupa:'Oprema',       defaultPriceRsd:6900,   nabavnaRsd:3200,   baseStock:12, postarinaRsd:600},
    {sku:'OPR-RUKAV',  name:'Rukavice XL',         grupa:'Oprema',       defaultPriceRsd:2490,   nabavnaRsd:960,    baseStock:20, postarinaRsd:350},
    {sku:'OPR-NAOC',   name:'Naočare cross',       grupa:'Oprema',       defaultPriceRsd:1990,   nabavnaRsd:760,    baseStock:18, postarinaRsd:350}
  ];

  var PLACANJA   = ['Gotovina','Kartica','Prenos na račun','Pouzećem'];
  var KAT_TROSKA = ['KupujemProdajem','Marketing / oglasi','Plata radnika','Nabavka robe',
                    'Transport / carina','Poštarina','Alat i oprema','Gorivo','Režije','Knjigovodstvo','Ostalo'];
  var KVAROVI    = ['Motor','Elektrika','Prenos / kvačilo','Kočnice','Guma / točak','Transportno oštećenje','Ostalo'];
  var STATUSI    = ['Otvorena','U toku','Rešena','Odbijena'];
  var KOREKCIJE  = ['Popis','Oštećenje','Poklon','Ispravka'];
  var FIKSNI_MESECNO = 90000;

  var FIRMA_DEMO = {nazivFirme:'STANJE DEMO SHOP DOO', pib:'123456789', maticni:'21234567',
    ulica:'Bulevar oslobođenja 12', grad:'Novi Sad', email:'demo@stanje.rs', telefon:'060 123 4567',
    knjigovodjaIme:'Ana Knjigovođa', knjigovodjaEmail:'knjigovodja@primer.rs', slanjeMod:'podsetnik'};

  // Izmišljeni dobavljači za primere računa (fiskalni računi PURS)
  var DOBAVLJACI = ['AUTO DELOVI PLUS DOO','GORIVO PLUS DOO','VELEPRODAJA CENTAR DOO','TEHNO KUTAK DOO',
    'GUMA CENTAR SZR','ALAT NABAVKA DOO','ŠPED TRANS DOO','KANCELARIJSKI SVET DOO'];

  // ── Skladište ──
  function prazno(){ return {sales:[], costs:[], complaints:[], kapare:[], racuni:[], noviProizvodi:[],
    stock:{}, firma:JSON.parse(JSON.stringify(FIRMA_DEMO)), kurs:117.5, seq:1}; }
  function ucitaj(){ try{ var s=JSON.parse(localStorage.getItem(STORE_KEY)); if(s&&s.sales)return s; }catch(e){} return null; }
  function snimi(s){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }catch(e){} }
  var store = ucitaj();
  // NB: seed() se poziva tek NAKON što su SALE_PATTERN/COST_PATTERN definisani (vidi dole).

  function noviId(){ return 'D'+(store.seq++); }
  function KURS(){ return store.kurs||117.5; }

  // Katalog = osnovni + ručno dodati (kroz „Novi artikal")
  function katalog(){ return CATALOG.concat(store.noviProizvodi||[]); }
  function nadjiProizvod(sku){ var l=katalog(); for(var i=0;i<l.length;i++) if(l[i].sku===sku) return l[i]; return null; }

  function danaPre(n, sat){ var d=new Date(); d.setDate(d.getDate()-n); d.setHours(sat||10, (n*7)%60, 0, 0); return d.toISOString(); }
  function datumSrp(d){ d=d||new Date();
    return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+d.getFullYear()+
      ' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0'); }

  // ── Početno „živo" stanje ──
  // Šabloni raspoređeni po DANU U MESECU — zaseju se i prošli (pun) i tekući mesec.
  // Tako „Pregled meseca" uvek ima bar jedan potpun, bogat mesec za reklame,
  // bez obzira kad se demo otvori (čak i 1. u mesecu).
  var SALE_PATTERN=[
    {d:2,sku:'SK-CITY125',kol:1,p:'Prenos na račun'}, {d:2,sku:'OPR-KACIGA',kol:1,p:'Kartica'},
    {d:3,sku:'OPR-RUKAV',kol:1,p:'Gotovina'}, {d:3,sku:'DEO-KARB',kol:1,p:'Gotovina'},
    {d:4,sku:'DB-CROSS125',kol:1,p:'Kartica'}, {d:4,sku:'DEO-FILTER',kol:2,p:'Kartica'},
    {d:5,sku:'ATV-KID49',kol:1,p:'Kartica'}, {d:5,sku:'OPR-NAOC',kol:1,p:'Gotovina'},
    {d:6,sku:'DEO-PLOC',kol:3,p:'Gotovina'}, {d:6,sku:'ATV-PRD125',kol:1,p:'Prenos na račun'},
    {d:7,sku:'SK-URB50',kol:1,p:'Prenos na račun'}, {d:8,sku:'DEO-AKU',kol:1,p:'Kartica'},
    {d:8,sku:'DB-PIT110',kol:1,p:'Gotovina'}, {d:9,sku:'DB-PIT110',kol:1,p:'Gotovina'},
    {d:9,sku:'DEO-LANAC',kol:3,p:'Gotovina'}, {d:10,sku:'ATV-PRD125',kol:1,p:'Prenos na račun'},
    {d:11,sku:'OPR-KACIGA',kol:2,p:'Kartica'}, {d:11,sku:'SK-CITY125',kol:1,p:'Kartica'},
    {d:12,sku:'DB-CROSS125',kol:1,p:'Kartica'}, {d:13,sku:'DEO-KARB',kol:2,p:'Gotovina'},
    {d:13,sku:'ATV-GRZ200',kol:1,p:'Prenos na račun'}, {d:14,sku:'SK-URB50',kol:1,p:'Kartica'},
    {d:15,sku:'ATV-GRZ200',kol:1,p:'Prenos na račun'}, {d:16,sku:'DB-END250',kol:1,p:'Kartica'},
    {d:17,sku:'OPR-NAOC',kol:1,p:'Gotovina'}, {d:17,sku:'DEO-PLOC',kol:2,p:'Gotovina'},
    {d:18,sku:'DB-PIT110',kol:1,p:'Kartica'}, {d:18,sku:'ATV-PRD125',kol:1,p:'Kartica'},
    {d:19,sku:'SK-CITY125',kol:1,p:'Prenos na račun'}, {d:20,sku:'DB-CROSS125',kol:1,p:'Prenos na račun'},
    {d:21,sku:'DEO-AKU',kol:1,p:'Gotovina'}, {d:21,sku:'DEO-LANAC',kol:2,p:'Gotovina'},
    {d:22,sku:'SK-URB50',kol:1,p:'Kartica'}, {d:23,sku:'DB-END250',kol:1,p:'Prenos na račun'},
    {d:24,sku:'ATV-KID49',kol:1,p:'Gotovina'}, {d:25,sku:'ATV-KID49',kol:1,p:'Kartica'},
    {d:25,sku:'OPR-RUKAV',kol:1,p:'Gotovina'}, {d:26,sku:'ATV-PRD125',kol:1,p:'Prenos na račun'},
    {d:27,sku:'OPR-KACIGA',kol:1,p:'Kartica'}, {d:27,sku:'DEO-FILTER',kol:1,p:'Gotovina'},
    {d:28,sku:'SK-CITY125',kol:1,p:'Kartica'}
  ];
  var COST_PATTERN=[
    {d:5,kat:'Marketing / oglasi',iznos:28000,opis:'Kampanja na društvenim mrežama',kome:'Oglasna mreža',p:'Kartica'},
    {d:6,kat:'Režije',iznos:16400,opis:'Struja i internet',kome:'Distribucija',p:'Prenos na račun'},
    {d:8,kat:'Gorivo',iznos:8500,opis:'Gorivo kombi',kome:'GORIVO PLUS DOO',p:'Kartica'},
    {d:9,kat:'Plata radnika',iznos:55000,opis:'Plata — prodavac',kome:'Radnik',p:'Prenos na račun'},
    {d:14,kat:'Transport / carina',iznos:41000,opis:'Carina kontejner',kome:'Špedicija',p:'Prenos na račun'}
  ];

  function seed(){
    var s = prazno();
    var now=new Date();
    var pmMesec = now.getMonth()===0 ? 12 : now.getMonth();
    var pmGodina = now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear();

    function unesiProdaju(sku, kol, placanje, dat){
      var p=CATALOG.find(function(x){return x.sku===sku;}); if(!p)return; var cena=p.defaultPriceRsd;
      s.sales.push({id:'D'+(s.seq++), sku:sku, naziv:p.name, grupa:p.grupa, datum:dat.toISOString(),
        kolicina:kol, cena:cena, placanje:placanje||'Gotovina', isporuka:'Licno', napomena:'',
        ukupnoRsd:cena*kol, nabavnaRsd:p.nabavnaRsd, uneo:'Demo', vraceno:0});
    }
    function zasejMesec(godina, mesec, doDana){
      SALE_PATTERN.forEach(function(t){ if(t.d>doDana)return;
        unesiProdaju(t.sku, t.kol, t.p, new Date(godina, mesec-1, t.d, 9+(t.d%8), (t.d*7)%60, 0)); });
      COST_PATTERN.forEach(function(t){ if(t.d>doDana)return;
        s.costs.push({id:'D'+(s.seq++), kategorija:t.kat, iznosRsd:t.iznos, opis:t.opis, kome:t.kome,
          placanje:t.p, datum:new Date(godina, mesec-1, t.d, 12, 0, 0).toISOString()}); });
    }
    // Prošli mesec — kompletan (garantovano bogat za reklame)
    zasejMesec(pmGodina, pmMesec, 28);
    // Tekući mesec — do juče (danas dodajemo posebno ispod)
    if(now.getDate()>1) zasejMesec(now.getFullYear(), now.getMonth()+1, now.getDate()-1);
    // Danas — uvek 3 prodaje (da „Danas" tab bude živ)
    unesiProdaju('DB-PIT110',1,'Kartica', new Date(now.getFullYear(),now.getMonth(),now.getDate(),9,15,0));
    unesiProdaju('OPR-KACIGA',1,'Gotovina', new Date(now.getFullYear(),now.getMonth(),now.getDate(),11,40,0));
    unesiProdaju('DEO-LANAC',2,'Gotovina', new Date(now.getFullYear(),now.getMonth(),now.getDate(),13,5,0));

    s.complaints.push({id:'D'+(s.seq++), sku:'DB-CROSS125', naziv:'Dirt bike Cross 125', vrsta:'Elektrika',
      status:'Rešena', opis:'Nije palio — zamenjen regulator napona', deo:3200, rad:2000, postarina:0, povracaj:0, napomena:'', datum:danaPre(3,14)});

    s.kapare.push({id:'D'+(s.seq++), sku:'ATV-GRZ200', naziv:'ATV Grizzly 200cc', kupac:'Marko Marković',
      kapara:30000, cena:259000, napomena:'Dolazi u subotu', datum:danaPre(1,11)});
    s.kapare.push({id:'D'+(s.seq++), sku:'DB-END250', naziv:'Dirt bike Enduro 250', kupac:'Jovan Jovanović',
      kapara:50000, cena:329000, napomena:'Čeka boju', datum:danaPre(2,15)});

    // ── Primeri fiskalnih računa (poslednjih ~25 dana; deo nije poslat da badge „Pošalji" bude živ) ──
    function racun(prodavac, iznos, danUnazad, trosak, kat, poslato, placanje){
      var d=new Date(); d.setDate(d.getDate()-danUnazad); d.setHours(11,20,0,0);
      s.racuni.push({id:'D'+(s.seq++), prodavac:prodavac, datumRacuna:datumSrp(d), iznos:iznos,
        ukupno:iznos, pdv:Math.round(iznos-iznos/1.2), stopa:'20%', pibStatus:'POTVRĐEN',
        nacinPlacanja:placanje||'Kartica', placanje:placanje||'Kartica',
        trosak:!!trosak, kategorija:trosak?kat:'', poslato:!!poslato, napomena:'', pibKupca:FIRMA_DEMO.pib, stavke:[]});
    }
    racun('AUTO DELOVI PLUS DOO',  34800, 1,  true,  'Nabavka robe', false, 'Prenos na račun');
    racun('GORIVO PLUS DOO',       6200,  3,  true,  'Gorivo',       false, 'Kartica');
    racun('VELEPRODAJA CENTAR DOO',18450, 5,  true,  'Nabavka robe', false, 'Kartica');
    racun('GUMA CENTAR SZR',       12900, 8,  true,  'Nabavka robe', false, 'Gotovina');
    racun('ALAT NABAVKA DOO',      9700,  11, true,  'Alat i oprema',true,  'Kartica');
    racun('KANCELARIJSKI SVET DOO',3300,  14, false, '',             true,  'Gotovina');
    racun('ŠPED TRANS DOO',        41000, 17, true,  'Transport / carina', true, 'Prenos na račun');
    racun('MAXI MARKET DOO',       2480,  20, false, '',             true,  'Kartica');
    racun('MOTO OPREMA DOO',       27600, 24, true,  'Nabavka robe', true,  'Prenos na račun');

    // Lager — lepe, zdrave količine (par niskih za priču „nema na stanju")
    CATALOG.forEach(function(p){ s.stock[p.sku]=p.baseStock; });
    s.stock['DB-END250']=0;   // rasprodato
    s.stock['ATV-GRZ200']=1;  // poslednji komad
    s.stock['SK-CITY125']=1;

    return s;
  }

  // Sada kada su seed() i šabloni definisani — inicijalizuj skladište.
  if(!store){ store = seed(); snimi(store); }

  // ─── pomoćne ───
  function uWindowu(iso, days){ var d=new Date(iso), sad=new Date();
    if(days===1) return d.toDateString()===sad.toDateString();
    var g=new Date(); g.setDate(g.getDate()-(days-1)); g.setHours(0,0,0,0); return d>=g; }
  function istiMesec(iso, g, m){ var d=new Date(iso); return d.getFullYear()===g && (d.getMonth()+1)===m; }
  function prodajaUkupno(s){ return s.cena*(s.kolicina-(s.vraceno||0)); }
  function najdi(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }
  var MESECI=['Januar','Februar','Mart','April','Maj','Jun','Jul','Avgust','Septembar','Oktobar','Novembar','Decembar'];

  // ─────────────────────── rute ───────────────────────
  var RUTE = {
    initial: function(){
      return {
        role:'owner', kursEur:KURS(), ime:'Demo vlasnik', token:'demo_'+Date.now(),
        firma: store.firma,
        products: katalog().map(function(p){
          return {sku:p.sku, name:p.name, grupa:p.grupa, defaultPriceRsd:p.defaultPriceRsd,
                  postarinaRsd:p.postarinaRsd||0, naStanju:(store.stock[p.sku]||0)}; }),
        kategorije: katalog().map(function(p){return p.grupa;}).filter(function(v,i,a){return a.indexOf(v)===i;}),
        paymentMethods:PLACANJA, costCategories:KAT_TROSKA,
        complaintCategories:KVAROVI, complaintStatuses:STATUSI, adjustmentReasons:KOREKCIJE
      };
    },
    odjava: function(){ return {ok:true}; },

    history: function(body){
      var days=body.days||1, stavke=[];
      store.sales.forEach(function(s){ if((s.kolicina-(s.vraceno||0))<=0) return;
        if(uWindowu(s.datum,days)) stavke.push({id:s.id, tip:'sale', naziv:s.naziv, datum:s.datum,
          placanje:s.placanje, kolicina:(s.kolicina-(s.vraceno||0)), iznosRsd:prodajaUkupno(s)}); });
      store.complaints.forEach(function(c){ if(uWindowu(c.datum,days)) stavke.push({id:c.id, tip:'complaint',
        naziv:c.naziv, datum:c.datum, status:c.status, iznosRsd:(c.deo||0)+(c.rad||0)+(c.postarina||0)+(c.povracaj||0)}); });
      stavke.sort(function(a,b){return new Date(b.datum)-new Date(a.datum);});
      var prodaje=stavke.filter(function(x){return x.tip==='sale';});
      var promet=prodaje.reduce(function(a,x){return a+x.iznosRsd;},0);
      return {brojProdaja:prodaje.length, prometRsd:promet, prometEur:promet/KURS(), stavke:stavke};
    },

    saveMulti: function(body){
      var rez=[];
      (body.stavke||[]).forEach(function(st,i){ try{ upisiStavku(st, body.enteredBy); rez.push({ok:true, redni:i+1}); }
        catch(e){ rez.push({ok:false, redni:i+1, error:e.message}); } });
      snimi(store);
      var ok=rez.filter(function(x){return x.ok;}).length;
      return {message:'Sačuvano ('+ok+'/'+rez.length+').', rezultati:rez};
    },

    izmenjive: function(body){
      var days=body.days||7;
      var stavke=store.sales.filter(function(s){return uWindowu(s.datum,days) && (s.kolicina-(s.vraceno||0))>0;})
        .map(function(s){return {id:s.id, naziv:s.naziv, datum:s.datum, korisnik:s.uneo||'Demo',
          kolicina:s.kolicina, cena:s.cena, napomena:s.napomena||'', placanje:s.placanje};});
      stavke.sort(function(a,b){return new Date(b.datum)-new Date(a.datum);});
      return {stavke:stavke};
    },
    izmeni: function(body){
      var s=najdi(store.sales, body.id); if(!s) throw new Error('Unos nije nađen.'); var iz=body.izmene||{};
      var razlika=(iz.quantity||s.kolicina)-s.kolicina;
      if(razlika!==0 && s.sku) store.stock[s.sku]=(store.stock[s.sku]||0)-razlika;
      if(iz.quantity!=null) s.kolicina=iz.quantity;
      if(iz.unit_sale_price_rsd!=null) s.cena=iz.unit_sale_price_rsd;
      if(iz.payment_method) s.placanje=iz.payment_method;
      if(iz.notes!=null) s.napomena=iz.notes;
      s.ukupnoRsd=s.cena*s.kolicina; snimi(store); return {message:'Izmena sačuvana.'};
    },
    obrisi: function(body){
      var s=najdi(store.sales, body.id); if(!s) throw new Error('Unos nije nađen.');
      if(s.sku) store.stock[s.sku]=(store.stock[s.sku]||0)+(s.kolicina-(s.vraceno||0));
      store.sales=store.sales.filter(function(x){return x.id!==body.id;});
      snimi(store); return {message:'Unos obrisan.'};
    },
    parse: function(body){ return {stavke: parsirajTekst(body.text||'')}; },

    pregled: function(body){
      var g=body.godina, m=body.mesec;
      var prodaje=store.sales.filter(function(s){return istiMesec(s.datum,g,m);});
      var promet=0, nabavka=0, poDan={}, topArt={};
      prodaje.forEach(function(s){ var neto=(s.kolicina-(s.vraceno||0)); if(neto<=0)return;
        var iznos=s.cena*neto; promet+=iznos; nabavka+=(s.nabavnaRsd||0)*neto;
        var dan=new Date(s.datum).getDate();
        poDan[dan]=poDan[dan]||{dan:dan,broj:0,promet:0}; poDan[dan].broj++; poDan[dan].promet+=iznos;
        topArt[s.sku]=topArt[s.sku]||{naziv:s.naziv,kolicina:0,promet:0}; topArt[s.sku].kolicina+=neto; topArt[s.sku].promet+=iznos; });
      var troskovi=store.costs.filter(function(c){return istiMesec(c.datum,g,m);});
      var varijabilni=troskovi.reduce(function(a,c){return a+(c.iznosRsd||0);},0);
      var kuda={}; troskovi.forEach(function(c){ kuda[c.kategorija]=(kuda[c.kategorija]||0)+(c.iznosRsd||0); });
      var rekl=store.complaints.filter(function(c){return istiMesec(c.datum,g,m);})
        .reduce(function(a,c){return a+(c.deo||0)+(c.rad||0)+(c.postarina||0)+(c.povracaj||0);},0);
      // Fiksni troškovi srazmerno danima koji su prošli — inače bi 1. u mesecu
      // ceo mesečni trošak pao na jedan dan prometa i marža bi bila negativna.
      var fiksni=0;
      if(prodaje.length){
        var sad=new Date();
        var uMesecu=new Date(g, m, 0).getDate();                 // broj dana u tom mesecu
        var tekuci=(g===sad.getFullYear() && m===sad.getMonth()+1);
        var proteklo=tekuci ? sad.getDate() : uMesecu;           // završen mesec = pun iznos
        fiksni=Math.round(FIKSNI_MESECNO*proteklo/uMesecu);
      }
      var neto=promet-nabavka-fiksni-varijabilni-rekl;
      return {mesec:MESECI[m-1], mesecBroj:m, godina:g, promet:promet, neto:neto, brojProdaja:prodaje.length,
        nabavka:nabavka, fiksni:fiksni, varijabilni:varijabilni, reklamacije:rekl,
        kudaOdlazi:Object.keys(kuda).map(function(k){return {kategorija:k,iznos:kuda[k]};}).sort(function(a,b){return b.iznos-a.iznos;}),
        poDanima:Object.keys(poDan).map(function(k){return poDan[k];}).sort(function(a,b){return a.dan-b.dan;}),
        topArtikli:Object.keys(topArt).map(function(k){return topArt[k];}).sort(function(a,b){return b.promet-a.promet;}).slice(0,8)};
    },

    stanje: function(){ return {stavke: katalog().map(function(p){
      return {sku:p.sku, naziv:p.name, grupa:p.grupa, naStanju:(store.stock[p.sku]||0)}; })}; },
    stanjeSacuvaj: function(body){ (body.stavke||[]).forEach(function(x){ store.stock[x.sku]=x.stanje; });
      snimi(store); return {message:'Stanje sačuvano ('+(body.stavke||[]).length+' artikala).'}; },

    kapare: function(){ return {stavke: store.kapare.slice().sort(function(a,b){return new Date(b.datum)-new Date(a.datum);})}; },
    kaparaSacuvaj: function(body){ var d=body.data||{}, p=nadjiProizvod(d.product_sku)||{name:d.product_sku};
      store.kapare.push({id:noviId(), sku:d.product_sku, naziv:p.name, kupac:d.kupac, kapara:d.kapara_rsd,
        cena:d.cena_rsd, napomena:d.napomena||'', datum:new Date().toISOString()});
      snimi(store); return {message:'Kapara sačuvana.'}; },
    kaparaObrisi: function(body){ store.kapare=store.kapare.filter(function(x){return x.id!==body.id;});
      snimi(store); return {message:'Kapara obrisana.'}; },

    povratKandidati: function(body){
      var stavke=store.sales.filter(function(s){return s.sku===body.sku && istiMesec(s.datum,body.godina,body.mesec) && (s.kolicina-(s.vraceno||0))>0;})
        .map(function(s){return {id:s.id, datum:s.datum, ostalo:(s.kolicina-(s.vraceno||0)), placanje:s.placanje, ukupnoRsd:prodajaUkupno(s), cenaRsd:s.cena};});
      return {stavke:stavke};
    },
    povrat: function(body){ var s=najdi(store.sales, body.id); if(!s) throw new Error('Prodaja nije nađena.');
      var kol=body.kolicina||0; s.vraceno=(s.vraceno||0)+kol; if(s.sku) store.stock[s.sku]=(store.stock[s.sku]||0)+kol;
      snimi(store); return {message:'Povrat sačuvan ('+kol+' kom).'}; },

    reklamacija: function(body){ var c=najdi(store.complaints, body.id); if(!c) throw new Error('Reklamacija nije nađena.');
      return {naziv:c.naziv, datum:c.datum, vrsta:c.vrsta, status:c.status, opis:c.opis, deo:c.deo, rad:c.rad, postarina:c.postarina, povracaj:c.povracaj, napomena:c.napomena}; },
    reklamacijaIzmeni: function(body){ var c=najdi(store.complaints, body.id); if(!c) throw new Error('Reklamacija nije nađena.'); var iz=body.izmene||{};
      ['vrsta','opis','status','napomena'].forEach(function(k){ if(iz[k]!=null)c[k]=iz[k]; });
      ['deo','rad','postarina','povracaj'].forEach(function(k){ if(iz[k]!=null)c[k]=iz[k]; });
      snimi(store); return {message:'Reklamacija izmenjena.'}; },
    reklamacijaObrisi: function(body){ store.complaints=store.complaints.filter(function(x){return x.id!==body.id;});
      snimi(store); return {message:'Reklamacija obrisana.'}; },

    // ── NOVE FUNKCIJE ──
    proizvodDodaj: function(body){
      var d=body.data||{}; if(!d.sku||!d.naziv) throw new Error('Nedostaje SKU ili naziv.');
      if(nadjiProizvod(d.sku)) throw new Error('Artikal sa tom šifrom već postoji.');
      var p={sku:d.sku, name:d.naziv, grupa:d.grupa||'Ostalo',
        defaultPriceRsd:Number(d.prodajna_rsd)||0, nabavnaRsd:Number(d.nabavna_rsd)|| (Number(d.nabavna_eur)*KURS())||0,
        postarinaRsd:Number(d.postarina_rsd)||0};
      store.noviProizvodi.push(p); store.stock[p.sku]=Number(d.pocetno_stanje)||0;
      snimi(store); return {message:'Artikal „'+d.naziv+'" dodat.'};
    },
    firmaSacuvaj: function(body){
      var d=body.data||{}; store.firma=Object.assign({}, store.firma, d);
      var cifre=String(d.pib||'').replace(/\D/g,''); var upoz=(cifre && cifre.length!==9);
      snimi(store);
      return {message: upoz?'Sačuvano (proverite PIB — treba 9 cifara).':'Podaci firme sačuvani.', firma:store.firma, pibUpozorenje:upoz};
    },
    kursSacuvaj: function(body){ var k=Number(body.kurs); if(!k||k<=0) throw new Error('Nevažeći kurs.');
      store.kurs=k; snimi(store); return {message:'Kurs sačuvan ('+k+').', kurs:k}; },

    racunLista: function(){ return {racuni: store.racuni.slice().sort(function(a,b){
      return (b.datumRacuna||'').localeCompare(a.datumRacuna||''); })}; },
    racunSacuvaj: function(body){
      // Demo „sken": napravi nasumičan verodostojan fiskalni račun
      var prodavac=DOBAVLJACI[Math.floor(Math.random()*DOBAVLJACI.length)];
      var iznos=[2400,3600,5900,8700,12400,18900,26500][Math.floor(Math.random()*7)]+Math.floor(Math.random()*400);
      var r={id:noviId(), prodavac:prodavac, datumRacuna:datumSrp(new Date()), iznos:iznos, ukupno:iznos,
        pdv:Math.round(iznos-iznos/1.2), stopa:'20%', pibStatus:'POTVRĐEN', pibKupca:store.firma.pib,
        nacinPlacanja:'Kartica', placanje:'Kartica', pfrVreme:datumSrp(new Date()),
        trosak:false, kategorija:'', poslato:false, napomena:'', stavke:[]};
      store.racuni.push(r); snimi(store);
      return {racun:r, id:r.id, duplikat:false, vecSacuvan:false};
    },
    racunTrosak: function(body){ var r=najdi(store.racuni, body.id); if(!r) throw new Error('Račun nije nađen.');
      r.trosak=!!body.trosak; r.kategorija=body.trosak?(body.kategorija||'Ostalo'):''; snimi(store);
      return {message: body.trosak?'Upisano u troškove.':'Samo arhiva.'}; },
    racunNapomena: function(body){ var r=najdi(store.racuni, body.id); if(!r) throw new Error('Račun nije nađen.');
      r.napomena=body.napomena||''; snimi(store); return {message:'Napomena sačuvana.'}; },
    racunOdbaci: function(body){ store.racuni=store.racuni.filter(function(x){return x.id!==body.id;});
      snimi(store); return {message:'Račun odbačen.'}; },
    racuniZaSlanje: function(){
      var neposlati=store.racuni.filter(function(x){return !x.poslato;});
      var total=neposlati.reduce(function(a,x){return a+(x.iznos||0);},0);
      var poKat={}; neposlati.filter(function(x){return x.trosak;}).forEach(function(x){
        poKat[x.kategorija||'Ostalo']=(poKat[x.kategorija||'Ostalo']||0)+(x.iznos||0); });
      return {knjigovodjaEmail:store.firma.knjigovodjaEmail||'', broj:neposlati.length, total:total, poCategoriji:poKat};
    },
    racuniPosalji: function(){ var n=0; store.racuni.forEach(function(x){ if(!x.poslato){x.poslato=true;x.datumSlanja=new Date().toISOString();n++;} });
      snimi(store); return {message:'Poslato '+n+' računa knjigovođi (demo — mejl se ne šalje stvarno).'} },
    racunIzmeni: function(body){ var r=najdi(store.racuni, body.id); if(!r) throw new Error('Račun nije nađen.');
      var iz=body.izmene||{};
      if(iz.prodavac) r.prodavac=iz.prodavac;
      if(iz.iznos!=null){ r.iznos=iz.iznos; r.ukupno=iz.iznos; }
      if(iz.pdv!=null) r.pdv=iz.pdv;
      snimi(store); return {message:'Ispravka sačuvana.'}; },
    racunPosaljiJedan: function(body){ var r=najdi(store.racuni, body.id); if(!r) throw new Error('Račun nije nađen.');
      r.poslato=true; r.datumSlanja=new Date().toISOString(); snimi(store);
      return {message:'Račun poslat knjigovođi (demo — mejl se ne šalje stvarno).'}; }
  };

  // upisiStavku — za saveMulti
  function upisiStavku(st, uneo){
    var t=st.entry_type;
    if(t==='sale'){
      var p=nadjiProizvod(st.product_sku); if(!p) throw new Error('Nepoznat artikal.');
      var kol=Number(st.quantity)||1, cena=Number(st.unit_sale_price_rsd)||p.defaultPriceRsd;
      store.sales.push({id:noviId(), sku:p.sku, naziv:p.name, grupa:p.grupa, datum:new Date().toISOString(),
        kolicina:kol, cena:cena, placanje:st.payment_method||'Gotovina', isporuka:st.isporuka||'Licno',
        napomena:st.notes||'', ukupnoRsd:cena*kol, nabavnaRsd:p.nabavnaRsd||0, uneo:uneo||'Demo', vraceno:0});
      store.stock[p.sku]=(store.stock[p.sku]||0)-kol;
    } else if(t==='cost'){
      store.costs.push({id:noviId(), kategorija:st.cost_category||'Ostalo', iznosRsd:Number(st.total_amount_rsd)||0,
        opis:st.description||'', kome:st.supplier||'', placanje:st.payment_method||'Gotovina', datum:new Date().toISOString()});
    } else if(t==='complaint'){
      var pr=nadjiProizvod(st.product_sku)||{name:st.product_sku||'Artikal'};
      store.complaints.push({id:noviId(), sku:st.product_sku, naziv:pr.name, vrsta:st.cost_category||'Ostalo',
        status:st.complaint_status||'Otvorena', opis:st.description||'', deo:Number(st.part_cost_rsd)||0,
        rad:Number(st.labor_cost_rsd)||0, postarina:Number(st.shipping_cost_rsd)||0, povracaj:Number(st.refund_rsd)||0,
        napomena:st.notes||'', datum:new Date().toISOString()});
    } else if(t==='purchase'){ if(st.product_sku && store.stock[st.product_sku]!=null) store.stock[st.product_sku]+=Number(st.quantity)||0;
    } else if(t==='adjustment'){ if(st.product_sku && store.stock[st.product_sku]!=null) store.stock[st.product_sku]+=Number(st.quantity_change)||0;
    } else if(t==='product_update'){ if(st.product_sku && st.stock_on_hand!=null) store.stock[st.product_sku]=Number(st.stock_on_hand); }
  }

  // Preslovljavanje ćirilica→latinica (ćirilični unos pogađa latinični katalog)
  var CIR2LAT={'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l',
    'љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'};
  function preslovi(s){ return String(s).toLowerCase().replace(/[а-шђћчџњљ]/g,function(c){return CIR2LAT[c]||c;})
    .replace(/š|ž|đ/g,function(c){return {'š':'s','ž':'z','đ':'dj'}[c];}).replace(/č|ć/g,'c'); }
  var REC_BROJ={'jedan':1,'jednu':1,'jedno':1,'dva':2,'dve':2,'tri':3,'cetiri':4,'pet':5,'sest':6,'sedam':7,'osam':8,'devet':9,'deset':10};

  function parsirajTekst(text){
    var t=preslovi(text||''); var nadjen=null, najbolji=0;
    katalog().forEach(function(p){
      var kljuc=preslovi(p.name).split(/[\s\/]+/).filter(function(w){return w.length>2;});
      var pogodaka=kljuc.filter(function(w){return t.indexOf(w.slice(0,4))>=0;}).length;
      if(pogodaka>najbolji){ najbolji=pogodaka; nadjen=p; } });
    var brojevi=(t.replace(/\./g,'').match(/\d+/g)||[]).map(Number);
    var kolicina=1, cena=null;
    Object.keys(REC_BROJ).forEach(function(r){ if(t.indexOf(r)>=0) kolicina=REC_BROJ[r]; });
    brojevi.forEach(function(n){ if(n>=1&&n<=20&&cena===null){kolicina=n;} });
    var veliki=brojevi.filter(function(n){return n>=100;}); if(veliki.length) cena=Math.max.apply(null,veliki);
    var placanje = t.indexOf('kartic')>=0 ? 'Kartica'
                 : (t.indexOf('prenos')>=0||t.indexOf('racun')>=0 ? 'Prenos na račun'
                 : (t.indexOf('pouzec')>=0 ? 'Pouzećem' : 'Gotovina'));
    if(!nadjen) return [{entry_type:'sale', product_sku:'', quantity:kolicina, unit_sale_price_rsd:cena,
      payment_method:placanje, needs_review:true, review_message:'Demo: nisam prepoznao artikal — izaberi ručno.'}];
    return [{entry_type:'sale', product_sku:nadjen.sku, quantity:kolicina, unit_sale_price_rsd:cena||nadjen.defaultPriceRsd,
      payment_method:placanje, needs_review:(cena===null), review_message:cena===null?'Demo: proveri cenu.':''}];
  }

  // ─── demo dugmad ───
  window.resetujDemo = function(){ if(!confirm('Resetovati demo na početne izmišljene podatke?')) return;
    store = seed(); snimi(store); try{localStorage.removeItem('stanjeRacuniPending');}catch(e){} location.reload(); };

  // „Ubaci primer računa" — simulira uspešan sken bez kamere
  window.demoUbaciRacun = async function(){
    try{
      var r=await fetch('/api/backend',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'racunSacuvaj', pin:'demo', url:'demo://racun/'+Date.now()})}).then(function(x){return x.json();});
      if(r&&r.result&&typeof window.prikaziRacun==='function'){ window.prikaziRacun(r.result.racun, r.result); }
    }catch(e){ alert('Demo račun greška: '+e.message); }
  };

  // ─── presretanje fetch-a ───
  var praviFetch = window.fetch.bind(window);
  window.fetch = function(url, opcije){
    var putanja = (typeof url==='string') ? url : (url && url.url) || '';
    if(putanja.indexOf('/api/backend')>=0){
      var body={}; try{ body=JSON.parse((opcije&&opcije.body)||'{}'); }catch(e){}
      try{ var ruta=RUTE[body.action];
        if(!ruta) return odgovor({ok:false, error:'Demo: nepoznata akcija „'+body.action+'".'}, false);
        return odgovor({ok:true, result:ruta(body)}, true);
      }catch(err){ return odgovor({ok:false, error:err.message||'Demo greška.'}, false); }
    }
    if(putanja.indexOf('/api/transcribe')>=0)
      return odgovor({ok:false, error:'Demo: glasovni unos nije aktivan u demo verziji.'}, false);
    return praviFetch(url, opcije);
  };
  function odgovor(payload, ok){ return Promise.resolve({ ok: ok!==false, status: ok!==false?200:400,
    json: function(){ return Promise.resolve(payload); }, text: function(){ return Promise.resolve(JSON.stringify(payload)); } }); }

  console.log('%cSTANJE DEMO aktivan (v3 — latinica, redizajn)','background:#baff29;color:#0b1400;padding:2px 8px;border-radius:4px;font-weight:700');
})();
