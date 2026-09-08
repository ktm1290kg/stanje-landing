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
     Šalje se na /api/leads, isto kao i do sada. */

  var forma = document.querySelector(".lead-form");
  if (forma) {
    var poruka = document.createElement("p");
    poruka.className = "form-poruka";
    poruka.setAttribute("role", "status");
    forma.appendChild(poruka);

    forma.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (forma.dataset.stanje === "salje") return;
      forma.dataset.stanje = "salje";
      poruka.className = "form-poruka";
      poruka.textContent = "Šaljem…";

      var p = new FormData(forma);
      var telo = {
        name: String(p.get("name") || "").trim(),
        phone: String(p.get("phone") || "").trim(),
        email: String(p.get("email") || "").trim(),
        businessType: String(p.get("businessType") || "").trim() || "Nije navedeno",
        teamSize: String(p.get("teamSize") || "").trim() || "Nije navedeno"
      };

      /* Email je obavezan — na njega ide potvrda termina i link za poziv.
         Pregledač ovo već proverava (type=email required), ali stariji
         pregledači i automatsko popunjavanje umeju da provuku prazno. */
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(telo.email)) {
        poruka.className = "form-poruka greska";
        poruka.textContent = "Unesite ispravnu email adresu — na nju šaljemo potvrdu termina.";
        forma.dataset.stanje = "";
        var polje = forma.querySelector('input[name="email"]');
        if (polje) polje.focus();
        return;
      }

      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telo)
      }).then(function (r) {
        if (r.status === 400) throw new Error("mejl");
        if (!r.ok) throw new Error("status " + r.status);
        poruka.className = "form-poruka ok";
        poruka.textContent = "Primili smo prijavu. Javljamo se na telefon, a potvrdu termina šaljemo na email.";
        forma.reset();
        if (window.fbq) window.fbq("track", "Lead");
        if (window.gtag) window.gtag("event", "generate_lead");
      }).catch(function (e) {
        poruka.className = "form-poruka greska";
        poruka.textContent = String(e && e.message) === "mejl"
          ? "Email adresa nije ispravna. Proverite je pa pošaljite ponovo."
          : "Prijava nije poslata. Pozovite nas na 063/693-485 ili pokušajte ponovo.";
      }).finally(function () {
        forma.dataset.stanje = "";
      });
    });
  }
})();
