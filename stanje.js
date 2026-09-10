/* ═══════════════════════════════════════════════════════════════
   stanje.rs — sva interaktivnost ulazne strane, bez ijednog okvira.
   Zamenjuje React pakete: business-pulse, interactive-demo,
   lead-form i meta-pixel. Sve što strana radi je ovde, čitko.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var GA = "G-R7MJF9JP7Z";
  var PIKSEL = "1819932709383698";
  var KLJUC = "stanje_analytics_consent";

  /* ── 1. Kolačići i merenje ────────────────────────────────────
     Ništa se ne meri dok posetilac ne pristane. Tako je bilo i pre,
     samo je bilo skriveno u paketu. */

  function procitajPristanak() {
    try { return localStorage.getItem(KLJUC); } catch (e) { return null; }
  }
  function zapisiPristanak(v) {
    try { localStorage.setItem(KLJUC, v); } catch (e) {}
  }

  function upaliMerenje() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("consent", "update", {
      ad_storage: "granted", analytics_storage: "granted",
      ad_user_data: "granted", ad_personalization: "granted"
    });
    window.gtag("config", GA);
    var g = document.createElement("script");
    g.async = true;
    g.src = "https://www.googletagmanager.com/gtag/js?id=" + GA;
    document.head.appendChild(g);

    /* Meta piksel */
    if (!window.fbq) {
      var f = window.fbq = function () {
        f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments);
      };
      f.push = f; f.loaded = true; f.version = "2.0"; f.queue = [];
      var m = document.createElement("script");
      m.async = true; m.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(m);
    }
    window.fbq("init", PIKSEL);
    window.fbq("track", "PageView");
  }

  function panelKolacica() {
    var d = document.createElement("div");
    d.className = "cc-backdrop";
    d.innerHTML =
      '<div class="cc-panel" role="dialog" aria-modal="true" aria-labelledby="cc-naslov">' +
        '<span class="cc-dot" aria-hidden="true"></span>' +
        '<h2 id="cc-naslov">Pomozite nam da izmerimo puls sajta.</h2>' +
        '<p>Koristimo neophodne kolačiće za rad sajta, a uz vašu dozvolu i analitiku ' +
        'koja nam pokazuje šta je posetiocima korisno i kako da STANJE učinimo boljim.</p>' +
        '<div class="cc-actions">' +
          '<button type="button" class="cc-yes">Prihvatam analitiku</button>' +
          '<button type="button" class="cc-no">Nastavi samo sa neophodnim</button>' +
        '</div>' +
      "</div>";
    document.body.appendChild(d);

    function zatvori(odgovor) {
      zapisiPristanak(odgovor);
      d.remove();
      if (odgovor === "granted") upaliMerenje();
    }
    d.querySelector(".cc-yes").addEventListener("click", function () { zatvori("granted"); });
    d.querySelector(".cc-no").addEventListener("click", function () { zatvori("denied"); });
    d.querySelector(".cc-yes").focus();
  }

  var pristanak = procitajPristanak();
  if (pristanak === "granted") upaliMerenje();
  else if (pristanak !== "denied") panelKolacica();

  /* ── 2. Puls prodaje ──────────────────────────────────────────
     Broj prodaja polako raste i kratko blesne poruka o novoj prodaji. */

  var brojac = document.querySelector(".monitor-stats strong");
  var toast = document.querySelector(".sale-toast");
  var tihoKretanje = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (brojac && !tihoKretanje) {
    var n = parseInt(brojac.textContent, 10) || 35;
    setInterval(function () {
      if (document.hidden) return;
      brojac.textContent = String(++n);
      if (toast) {
        toast.classList.add("vidljiv");
        setTimeout(function () { toast.classList.remove("vidljiv"); }, 2200);
      }
    }, 9000);
  }

  /* ── 3. Prekidač Danas / 7 dana ──────────────────────────────── */

  var periodi = document.querySelectorAll(".period-switch button");
  Array.prototype.forEach.call(periodi, function (b) {
    b.addEventListener("click", function () {
      Array.prototype.forEach.call(periodi, function (x) { x.classList.remove("active"); });
      b.classList.add("active");
    });
  });

  /* ── 4. Dugmad u telefonu vode u pravi demo ───────────────────
     Ranije su otvarala lažni prikaz unutar slike telefona. Sada
     postoji stvarni demo, pa vode tamo — to je ono što čovek i traži
     kad klikne. */

  var akcije = document.querySelectorAll(".demo-action");
  Array.prototype.forEach.call(akcije, function (b) {
    b.addEventListener("click", function () { window.location.href = "/demo.html"; });
    b.setAttribute("title", "Otvori demo aplikacije");
  });

  /* ── 5. Prijava za demo ───────────────────────────────────────
     Šalje se na /api/leads. SVA POLJA SU OBAVEZNA — prijava bez
     ispravnog telefona i email adrese ne vredi ništa, jer se čoveku
     više ne možemo javiti.

     Na strani stoje DVE iste forme: jedna odmah ispod početnog ekrana
     (za onoga ko je već ubeđen) i jedna na dnu (za onoga ko prvo čita
     sve). Zato je sve ispod napisano da radi za bilo koju formu i
     poziva se za svaku ponaosob — nema deljenog stanja među njima.

     Provere ovde služe da se greška vidi ODMAH, dok je čovek još u
     polju. Pravi čuvar je server (server/src/lib/kontakt.ts u
     stanje-finance) — ova forma se može zaobići. Poruke su namerno
     iste kao serverske, da čovek ne dobije dva različita objašnjenja
     za istu grešku. */

  /* ── Zajednička znanja o telefonu i mejlu ────────────────────── */

  function proveriTelefon(v) {
    var sirovo = String(v || "").trim();
    if (!sirovo) return "Unesite broj telefona.";
    if (sirovo.charAt(0) === "+" && sirovo.indexOf("+381") !== 0) {
      return /^\+\d{8,15}$/.test(sirovo.replace(/[\s\/-]/g, ""))
        ? "" : "Međunarodni broj nema ispravan broj cifara.";
    }
    var d = sirovo.replace(/\D/g, "");
    if (d.indexOf("00381") === 0) d = d.slice(5);
    else if (d.charAt(0) === "0") d = d.slice(1);
    else if (d.indexOf("381") === 0) d = d.slice(3);
    if (/^(\d)\1+$/.test(d)) return "Broj telefona nije ispravan.";
    if (d.length < 8) return "Broj ima premalo cifara (" + d.length + "). Primer: 064 123 4567.";
    if (d.length > 9) return "Broj ima previše cifara (" + d.length + "). Primer: 064 123 4567.";
    if (!/^[1-7]/.test(d)) return "Pozivni broj ne postoji u Srbiji. Primer: 064 123 4567.";
    return "";
  }

  /* Cifre se same razdvajaju dok se kuca. Razmaci u „064 123 4567"
     nisu ukras — grupisan broj se lakše pročita sa papira i lakše se
     uoči cifra viška ili manjak. */
  function maskaTelefona(el) {
    var naKraju = el.selectionStart === el.value.length;
    var v = el.value;
    /* Strani broj (izričito +, a nije naš) ostavljamo kako je kucan. */
    if (v.charAt(0) === "+" && v.indexOf("+381") !== 0) return;

    var d = v.replace(/\D/g, "");
    var nula = v.charAt(0) === "0";
    if (d.indexOf("00381") === 0) d = d.slice(5);
    else if (v.indexOf("+381") === 0) d = d.slice(3);
    else if (d.charAt(0) === "0") d = d.slice(1);
    else if (d.charAt(0) !== "6" && d !== "") return;  /* ne znamo šta je — ne diraj */

    d = d.slice(0, 9);
    var t = d === "" ? (nula ? "0" : "") : "0" + d.slice(0, 2);
    if (d.length > 2) t += " " + d.slice(2, 5);
    if (d.length > 5) t += " " + d.slice(5);
    if (t === el.value) return;
    el.value = t;
    if (naKraju) el.setSelectionRange(t.length, t.length);
  }

  var OBLIK_MEJLA = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,18}$/;

  var POZNATI_DOMENI = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com",
    "mts.rs", "eunet.rs", "open.telekom.rs", "sbb.rs", "ptt.rs", "ymail.com"];

  var POZNATI_NASTAVCI = ["com", "net", "org", "info", "biz", "io", "co", "me",
    "eu", "dev", "app", "rs", "ba", "hr", "mk", "si", "bg", "de", "at", "ch",
    "it", "fr", "uk", "us", "ru", "edu", "gov", "shop", "online", "store"];

  /* Razmak izmene koji ZAMENU SUSEDNIH SLOVA broji kao jednu grešku —
     „gmial.com" je najčešća omaška pri brzom kucanju, a obican
     Levenštajn je vidi kao dve izmene pa bi prošla neopaženo. */
  function razmak(a, b, granica) {
    if (Math.abs(a.length - b.length) > granica) return granica + 1;
    var preth = [], red = [], i, j;
    for (j = 0; j <= b.length; j++) red.push(j);
    for (i = 1; i <= a.length; i++) {
      var novi = [i], najmanji = i;
      for (j = 1; j <= b.length; j++) {
        var c = Math.min(red[j] + 1, novi[j - 1] + 1,
          red[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) &&
            a.charAt(i - 2) === b.charAt(j - 1)) {
          c = Math.min(c, preth[j - 2] + 1);
        }
        novi.push(c);
        if (c < najmanji) najmanji = c;
      }
      if (najmanji > granica) return granica + 1;
      preth = red; red = novi;
    }
    return red[b.length];
  }

  function predlogZaDomen(domen) {
    var d = String(domen).toLowerCase(), i;
    if (POZNATI_DOMENI.indexOf(d) >= 0) return null;
    for (i = 0; i < POZNATI_DOMENI.length; i++) {
      if (razmak(d, POZNATI_DOMENI[i], 1) === 1) return POZNATI_DOMENI[i];
    }
    var tacka = d.lastIndexOf(".");
    if (tacka < 1) return null;
    var nastavak = d.slice(tacka + 1);
    if (POZNATI_NASTAVCI.indexOf(nastavak) >= 0) return null;
    for (i = 0; i < POZNATI_NASTAVCI.length; i++) {
      if (razmak(nastavak, POZNATI_NASTAVCI[i], 1) === 1) {
        return d.slice(0, tacka + 1) + POZNATI_NASTAVCI[i];
      }
    }
    return null;
  }

  function proveriMejl(v) {
    var m = String(v || "").trim();
    if (!m) return "Unesite email adresu.";
    if (m.length > 200) return "Email adresa je predugačka.";
    if (!OBLIK_MEJLA.test(m)) return "Email adresa nije ispravna. Primer: ime@primer.rs";
    return "";
  }

  /* ── Jedna forma ─────────────────────────────────────────────── */

  function postaviFormu(forma) {
    var poruka = document.createElement("p");
    poruka.className = "form-poruka";
    poruka.setAttribute("role", "status");
    var dugme = forma.querySelector('button[type="submit"]');
    forma.insertBefore(poruka, dugme);

    var polja = {
      name: forma.querySelector('input[name="name"]'),
      phone: forma.querySelector('input[name="phone"]'),
      email: forma.querySelector('input[name="email"]'),
      businessType: forma.querySelector('select[name="businessType"]'),
      teamSize: forma.querySelector('select[name="teamSize"]')
    };

    /* ── Poruka ispod jednog polja ───────────────────────────── */

    function ciljGreske(el) {
      var post = el.parentNode.querySelector(".polje-greska");
      if (!post) {
        post = document.createElement("small");
        post.className = "polje-greska";
        el.parentNode.appendChild(post);
      }
      return post;
    }

    function greskaPolja(el, tekst) {
      if (!el) return;
      var mesto = ciljGreske(el);
      mesto.textContent = tekst || "";
      mesto.hidden = !tekst;
      el.setAttribute("aria-invalid", tekst ? "true" : "false");
      el.classList.toggle("polje-lose", !!tekst);
    }

    var predlogRed = null;

    function sakrijPredlog() {
      if (predlogRed) predlogRed.hidden = true;
    }

    function ocistiSve() {
      poruka.className = "form-poruka";
      poruka.textContent = "";
      Object.keys(polja).forEach(function (k) { greskaPolja(polja[k], ""); });
      sakrijPredlog();
    }

    if (polja.phone) {
      polja.phone.addEventListener("input", function () { maskaTelefona(polja.phone); });
    }

    /* ── Tiha sumnja na omašku u domenu ──────────────────────────
       Predlog NE zaustavlja slanje — domen udaljen jedno slovo od
       „gmail.com" može biti nečiji stvaran domen. Zato se nudi, a
       čovek bira. Ono što stvarno ne postoji odbija server, koji
       proverava da li domen uopšte prima poštu. */

    function ponudiPredlog() {
      if (!polja.email) return;
      sakrijPredlog();
      var m = polja.email.value.trim().toLowerCase();
      if (!OBLIK_MEJLA.test(m)) return;
      var domen = m.slice(m.indexOf("@") + 1);
      var bolji = predlogZaDomen(domen);
      if (!bolji) return;
      var ceo = m.slice(0, m.indexOf("@") + 1) + bolji;

      if (!predlogRed) {
        predlogRed = document.createElement("small");
        predlogRed.className = "polje-predlog";
        polja.email.parentNode.appendChild(predlogRed);
      }
      predlogRed.hidden = false;
      predlogRed.textContent = "Da li ste mislili ";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "predlog-dugme";
      b.textContent = ceo;
      b.addEventListener("click", function () {
        polja.email.value = ceo;
        sakrijPredlog();
        greskaPolja(polja.email, "");
        polja.email.focus();
      });
      predlogRed.appendChild(b);
      predlogRed.appendChild(document.createTextNode(" ?"));
    }

    if (polja.email) {
      polja.email.addEventListener("blur", ponudiPredlog);
      polja.email.addEventListener("input", sakrijPredlog);
    }

    /* ── Provera pri izlasku iz polja ────────────────────────── */

    function proveriPolje(kljuc) {
      var el = polja[kljuc];
      if (!el) return "";
      var v = String(el.value || "").trim();
      var g = "";
      if (kljuc === "name") {
        var slova = v.replace(/[^A-Za-zČĆĐŠŽčćđšžА-Яа-яЂЈЉЊЋЏђјљњћџ]/g, "").length;
        g = !v ? "Unesite ime i prezime." : (slova < 2 ? "Ime i prezime nisu ispravni." : "");
      } else if (kljuc === "phone") g = proveriTelefon(v);
      else if (kljuc === "email") g = proveriMejl(v);
      else if (kljuc === "businessType") g = v ? "" : "Izaberite vrstu posla.";
      else if (kljuc === "teamSize") g = v ? "" : "Izaberite broj zaposlenih.";
      greskaPolja(el, g);
      return g;
    }

    Object.keys(polja).forEach(function (k) {
      var el = polja[k];
      if (!el) return;
      var dogadjaj = el.tagName === "SELECT" ? "change" : "blur";
      el.addEventListener(dogadjaj, function () { proveriPolje(k); });
      /* Kad čovek krene da ispravlja, poruka o grešci smeta — sklanja se. */
      el.addEventListener("input", function () { greskaPolja(el, ""); });
    });

    /* ── Slanje ──────────────────────────────────────────────── */

    forma.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (forma.dataset.stanje === "salje") return;
      ocistiSve();

      var redosled = ["name", "phone", "email", "businessType", "teamSize"];
      var prvoLose = null;
      redosled.forEach(function (k) {
        if (proveriPolje(k) && !prvoLose) prvoLose = polja[k];
      });
      if (prvoLose) {
        poruka.className = "form-poruka greska";
        poruka.textContent = "Popunite sva polja — nedostaje ili nije ispravno ono označeno.";
        prvoLose.focus();
        return;
      }

      forma.dataset.stanje = "salje";
      poruka.textContent = "Šaljem…";

      var p = new FormData(forma);
      var telo = {
        name: String(p.get("name") || "").trim(),
        phone: String(p.get("phone") || "").trim(),
        email: String(p.get("email") || "").trim(),
        businessType: String(p.get("businessType") || "").trim(),
        teamSize: String(p.get("teamSize") || "").trim(),
        /* Mamac za robote: polje je sakriveno, čovek ga nikad ne popuni.
           Server tiho odbacuje prijavu u kojoj je popunjeno. */
        website: String(p.get("website") || "").trim()
      };

      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telo)
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (odgovor) {
          if (!r.ok) {
            var e = new Error((odgovor && odgovor.message) || "status " + r.status);
            e.polje = odgovor && odgovor.details && odgovor.details.polje;
            e.odServera = !!(odgovor && odgovor.message);
            throw e;
          }
          poruka.className = "form-poruka ok";
          poruka.textContent = "Primili smo prijavu. Javljamo se na telefon, " +
            "a potvrdu termina šaljemo na email.";
          forma.reset();
          if (window.fbq) window.fbq("track", "Lead");
          if (window.gtag) window.gtag("event", "generate_lead");
        });
      }).catch(function (e) {
        poruka.className = "form-poruka greska";
        if (e && e.polje && polja[e.polje]) {
          /* Server je rekao tačno koje polje ne valja — poruka ide pod njega. */
          greskaPolja(polja[e.polje], e.message);
          polja[e.polje].focus();
          poruka.textContent = "Proverite označeno polje pa pošaljite ponovo.";
        } else {
          poruka.textContent = (e && e.odServera && e.message) ||
            "Prijava nije poslata. Pozovite nas na 063/693-485 ili pokušajte ponovo.";
        }
      }).finally(function () {
        forma.dataset.stanje = "";
      });
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".lead-form"), postaviFormu);
})();
