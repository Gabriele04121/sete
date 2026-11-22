/* Sete: le fontanelle di Roma.
   Nessun server: i dati arrivano da OpenStreetMap e restano salvati sul telefono. */
(function () {
  'use strict';

  // ---------- Impostazioni (puoi cambiarle) ----------
  const ROMA = [12.4829, 41.8933];                 // longitudine, latitudine
  const RIQUADRO = '41.65,12.23,42.10,12.86';      // sud, ovest, nord, est
  const STILE_MAPPA = 'https://tiles.openfreemap.org/styles/liberty';
  const SERVER_PERCORSI = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
  const PACCHETTO = 'fontanelle.json';   // copia delle fontanelle pubblicata insieme all'app
  const SERVER_OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  const GIORNI_VALIDITA = 30;      // dopo quanti giorni riscaricare le fontanelle
  const LONTANO_DA_ROMA = 30000;   // metri: oltre, si esplora col centro della mappa
  const METRI_AL_MINUTO = 75;      // passo tranquillo, 4,5 km/h
  const ZOOM_SEGNI = 15;         // da qui in su i punti diventano segni animati
  const MAX_SEGNI = 150;
  const CHIAVE = 'sete.fontanelle.v2';
  const CHIAVE_FILTRO = 'sete.filtro';
  const CHIAVE_NASCOSTE = 'sete.nascoste';
  const SECONDI_ANNULLA = 7;     // quanto resta l'avviso con "Annulla"
  const GPS_INCERTO = 80;        // metri: oltre, avvisa che la posizione è approssimativa
  // Navigazione dentro Sete: spenta, le indicazioni si aprono in Google Maps (o Mappe su iPhone).
  // La versione guidata (vista inclinata, svolte, luoghi) è nel ramo "navigazione-guidata".
  const NAVIGAZIONE_INTERNA = true;
  const SOGLIA_ARRIVO = 15;      // metri: sotto, sei arrivato
  const ZOOM_CAMMINO = 18;       // zoom della mappa mentre cammini con "Vai"
  const INCLINAZIONE = 50;       // gradi: in navigazione la mappa si inclina per vedere la strada davanti
  const PAUSA_SEGUI = 8000;      // ms senza tocchi sulla mappa prima che riprenda a seguirti
  const FUORI_PERCORSO = 35;     // metri: oltre, il percorso si ricalcola
  const VICINO_LUOGO = 50;       // metri dal bordo di un luogo notevole per annunciarlo
  const LUOGHI = 'luoghi.json';  // monumenti, chiese, piazze... preparati dalla GitHub Action
  const CHIAVE_VOCE = 'sete.voce';
  const RAGGIO_LINK = 30;        // metri: tolleranza per ritrovare una fontanella da un link condiviso

  const $ = (id) => document.getElementById(id);
  const largo = window.matchMedia('(min-width: 900px)');
  const suApple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---------- Tipi di fontanella ----------
  const TIPI = {
    n: {
      nome: 'Nasone', plurale: 'nasoni',
      breve: 'La fontanella in ghisa di Roma, con l\u2019acqua che scorre sempre.',
      spiega: 'Nasone: l\u2019acqua esce di continuo dalla cannella. Tappa la bocca con un dito e zampilla dal forellino in alto, così bevi senza chinarti.'
    },
    f: {
      nome: 'Fontanella', plurale: 'fontanelle',
      breve: 'Acqua potabile, spesso con rubinetto o pulsante.',
      spiega: 'Fontanella: acqua potabile, di solito con un rubinetto o un pulsante da premere.'
    },
    m: {
      nome: 'Fontana', plurale: 'fontane',
      breve: 'Fontana ornamentale con acqua segnata come potabile.',
      spiega: 'Fontana: è una fontana ornamentale, ma la sua acqua è segnata come potabile. Bevi dal getto, non dalla vasca.'
    }
  };

  const NASONE = '<circle cx="50" cy="18" r="5"/><path d="M32 36C32 16 68 16 68 36Z"/><rect x="28" y="35" width="44" height="7" rx="2"/><path d="M32 41H68L72 116H28Z"/><rect x="20" y="115" width="60" height="10" rx="3"/>';

  // Piccoli disegni dentro i segni tondi.
  function glifo(t, animato) {
    if (t === 'n') {
      return '<svg viewBox="6 6 112 126"><path d="M64 74H86Q98 74 98 86" fill="none" stroke="#d9a93f" stroke-width="10" stroke-linecap="round"/>' +
        '<circle class="' + (animato ? 'goccia' : '') + '" cx="98" cy="106" r="7" fill="#35b3e6"/>' +
        '<g fill="#f1f3f0">' + NASONE + '</g></svg>';
    }
    if (t === 'f') {
      return '<svg viewBox="0 0 24 24"><path d="M12 2.5C12 2.5 5 11.2 5 15.4a7 7 0 0 0 14 0C19 11.2 12 2.5 12 2.5Z" fill="#fff"/>' +
        '<path d="M9 15.5a3.2 3.2 0 0 0 3 3.1" fill="none" stroke="#0b84b5" stroke-width="1.7" stroke-linecap="round"/></svg>';
    }
    const z = animato ? ' class="zampillo"' : '';
    return '<svg viewBox="0 0 24 24"><g fill="none" stroke="#1f2927" stroke-width="1.9" stroke-linecap="round">' +
      '<path' + z + ' d="M12 13V4.5"/><path' + z + ' d="M12 6Q7.4 6 6.6 11.5"/><path' + z + ' d="M12 6Q16.6 6 17.4 11.5"/></g>' +
      '<path d="M3 13.5h18c0 4.4-4 7-9 7s-9-2.6-9-7Z" fill="#1f2927"/></svg>';
  }

  // Disegni grandi nella scheda, con l'acqua che scorre.
  function figura(t) {
    const acqua = 'fill="none" stroke="#35b3e6" stroke-linecap="round"';
    if (t === 'n') {
      return '<svg viewBox="0 0 140 140">' +
        '<ellipse class="pozza" cx="98" cy="124" rx="24" ry="5.5" ' + acqua + ' stroke-width="2.2"/>' +
        '<ellipse class="pozza due" cx="98" cy="124" rx="24" ry="5.5" ' + acqua + ' stroke-width="2.2"/>' +
        '<path class="getto" d="M98 88V122" ' + acqua + ' stroke-width="6"/>' +
        '<path d="M64 74H86Q98 74 98 86" fill="none" stroke="#d9a93f" stroke-width="9" stroke-linecap="round"/>' +
        '<g fill="#f1f3f0">' + NASONE + '</g>' +
        '<rect x="31.5" y="58" width="37" height="3.5" fill="#1f2927" opacity=".22"/></svg>';
    }
    if (t === 'f') {
      return '<svg viewBox="0 0 140 140">' +
        '<path class="getto" d="M90 40Q84 10 60 44" ' + acqua + ' stroke-width="5"/>' +
        '<path d="M90 50V40" fill="none" stroke="#d9a93f" stroke-width="8" stroke-linecap="round"/>' +
        '<g fill="#f1f3f0"><rect x="32" y="46" width="76" height="7" rx="3.5"/>' +
        '<path d="M37 52H103C103 66 90 71 70 71S37 66 37 52Z"/><path d="M60 68H80L85 118H55Z"/>' +
        '<rect x="42" y="116" width="56" height="10" rx="3"/></g>' +
        '<rect x="58" y="84" width="24" height="3.5" fill="#1f2927" opacity=".22"/></svg>';
    }
    return '<svg viewBox="0 0 140 140">' +
      '<path class="getto" d="M70 48V16" ' + acqua + ' stroke-width="5"/>' +
      '<path class="getto" d="M70 20Q48 18 46 48" ' + acqua + ' stroke-width="4"/>' +
      '<path class="getto" d="M70 20Q92 18 94 48" ' + acqua + ' stroke-width="4"/>' +
      '<path class="getto" d="M46 64Q36 78 32 98" ' + acqua + ' stroke-width="4"/>' +
      '<path class="getto" d="M94 64Q104 78 108 98" ' + acqua + ' stroke-width="4"/>' +
      '<g fill="#f1f3f0"><rect x="38" y="50" width="64" height="6" rx="3"/>' +
      '<path d="M42 55H98C98 65 88 69 70 69S42 65 42 55Z"/><path d="M63 67H77L81 100H59Z"/>' +
      '<rect x="12" y="98" width="116" height="7" rx="3.5"/><path d="M17 104H123C123 120 100 126 70 126S17 120 17 104Z"/></g>' +
      '<circle cx="70" cy="50" r="4.5" fill="#d9a93f"/></svg>';
  }

  $('marchio-segno').innerHTML = glifo('n', false);
  $('sipario-logo').innerHTML = figura('n');
  $('legenda').innerHTML = ['n', 'f', 'm'].map((t) =>
    '<li><div class="mini t-' + t + '">' + glifo(t, true) + '</div><div><strong>' + TIPI[t].nome +
    '</strong><span>' + TIPI[t].breve + '</span></div></li>').join('');

  // ---------- Stato ----------
  let punti = [];            // [lat, lon, tipo, nome, strada, extra]; i dati vecchi hanno solo i primi 4
  let quando = 0;
  let filtro = 't';          // t = tutte, oppure n / f / m
  let io = null;             // {lat, lon}
  let ioLontano = false;
  let gpsNegato = false;
  let fissata = null;        // fontanella scelta a mano
  let navigando = false;     // modalità "Vai": la destinazione resta fissa
  let meta = null;           // fontanella di destinazione durante la navigazione
  let seguendo = false;      // la mappa segue l'utente
  let arrivoFatto = false;
  let attesaArrivo = null;
  let bloccoSchermo = null;  // Screen Wake Lock
  let vicine = [];           // [{i, d}] ordinate per distanza
  let ultimaMostrata = null;
  let primaVista = true;
  let mappaPronta = false;
  let aperta = false;
  let stato = 'media';       // posizione della scheda: mini, media o aperta
  let peek = 0;
  let map = null;
  let segnoIo = null, segnoScelto = null, sceltoIndice = null;
  const segni = new Map();   // indice -> Marker
  const strade = new Map();  // indice -> nome della strada trovata da Nominatim (ripiego)
  const nascoste = new Set(); // fontanelle nascoste dall'utente, come "lat,lon" a 5 decimali

  // ---------- Misure ----------
  const RAD = Math.PI / 180;
  function metri(aLat, aLon, bLat, bLon) {
    const x = (bLon - aLon) * RAD * Math.cos(((aLat + bLat) / 2) * RAD);
    const y = (bLat - aLat) * RAD;
    return Math.sqrt(x * x + y * y) * 6371000;
  }
  function gradiVerso(aLat, aLon, bLat, bLon) {
    const y = Math.sin((bLon - aLon) * RAD) * Math.cos(bLat * RAD);
    const x = Math.cos(aLat * RAD) * Math.sin(bLat * RAD) -
      Math.sin(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((bLon - aLon) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  function verso(aLat, aLon, bLat, bLon) {
    const gradi = gradiVerso(aLat, aLon, bLat, bLon);
    return ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'][Math.round(gradi / 45) % 8];
  }
  function distanza(d) {
    if (d < 1000) return { v: d < 30 ? Math.max(5, Math.round(d / 5) * 5) : Math.round(d / 10) * 10, u: 'm' };
    const km = d / 1000;
    return { v: km < 10 ? Math.round(km * 10) / 10 : Math.round(km), u: 'km' };
  }
  const cifre = (v) => String(v).replace('.', ',');
  function minuti(d) {
    const m = Math.max(1, Math.round(d / METRI_AL_MINUTO));
    if (m < 60) return m + ' min a piedi';
    const ore = Math.floor(m / 60), resto = m % 60;
    return ore + ' h' + (resto ? ' ' + resto + ' min' : '') + ' a piedi';
  }
  // Le fontanelle nascoste si riconoscono dalle coordinate: gli indici cambiano a ogni aggiornamento dei dati.
  const chiaveDi = (lat, lon) => lat.toFixed(5) + ',' + lon.toFixed(5);
  const chiave = (i) => chiaveDi(punti[i][0], punti[i][1]);
  // Unico punto in cui si decide se una fontanella si vede: filtro del tipo e fontanelle nascoste.
  const passa = (i) => (filtro === 't' || punti[i][2] === filtro) && !(nascoste.size && nascoste.has(chiave(i)));

  // ---------- Fontanelle nascoste ----------
  try {
    const salvate = JSON.parse(localStorage.getItem(CHIAVE_NASCOSTE) || '[]');
    if (Array.isArray(salvate)) salvate.forEach((k) => { if (/^-?\d+\.\d{5},-?\d+\.\d{5}$/.test(k)) nascoste.add(k); });
  } catch (e) { /* niente: si parte senza nascoste */ }
  function salvaNascoste() {
    try { localStorage.setItem(CHIAVE_NASCOSTE, JSON.stringify(Array.from(nascoste))); } catch (e) { /* memoria piena */ }
  }
  function indiceDa(k) {
    for (let i = 0; i < punti.length; i++) if (chiave(i) === k) return i;
    return -1;
  }
  // Dopo un cambio: si ridisegna tutto e, se non resta nulla da mostrare, si toglie il segno scelto.
  function rinfrescaTutto() {
    ridisegnaPunti();
    aggiorna();
    if (mostrata() == null && segnoScelto) { segnoScelto.remove(); segnoScelto = null; sceltoIndice = null; }
  }

  let attesaAvviso = null;
  // Avviso breve sotto i filtri; con "annulla" mostra il pulsante per rimediare.
  function avviso(testo, annulla) {
    clearTimeout(attesaAvviso);
    const el = $('avviso');
    $('avviso-testo').textContent = testo;
    $('btn-annulla').hidden = !annulla;
    $('btn-annulla').onclick = annulla ? () => { chiudiAvviso(); annulla(); } : null;
    el.hidden = false;
    // si riavvia l'animazione se l'avviso è già visibile
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    attesaAvviso = setTimeout(chiudiAvviso, annulla ? SECONDI_ANNULLA * 1000 : 2400);
  }
  function chiudiAvviso() {
    clearTimeout(attesaAvviso);
    $('avviso').hidden = true;
  }

  function nascondi(k) {
    const i = indiceDa(k);
    const eraFissata = i !== -1 && fissata === i;
    nascoste.add(k);
    salvaNascoste();
    if (eraFissata) fissata = null;
    if (stato === 'aperta') imposta('media');   // si vede subito la fontanella successiva
    rinfrescaTutto();
    avviso('Fatto, non la vedrai più.', () => {
      nascoste.delete(k);
      salvaNascoste();
      const j = indiceDa(k);
      if (eraFissata && j !== -1) fissata = j;
      rinfrescaTutto();
      if (mostrata() != null) inquadra();
    });
  }

  // ---------- Dati ----------
  function leggiSalvati() {
    try {
      const s = JSON.parse(localStorage.getItem(CHIAVE) || 'null');
      if (s && Array.isArray(s.punti) && s.punti.length) { punti = s.punti; quando = s.quando; return true; }
    } catch (e) { /* dati rovinati: si riscaricano */ }
    return false;
  }

  // Copia pronta delle fontanelle, aggiornata ogni settimana da GitHub: il primo avvio è immediato.
  async function leggiPacchetto() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(PACCHETTO, { cache: 'no-cache', signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) return null;
      const j = await r.json();
      if (!j || !Array.isArray(j.punti) || j.punti.length < 50 || !j.quando) return null;
      return j;
    } catch (e) { return null; }
  }
  function usaPacchetto(j) {
    if (navigando) finisciNavigazione();   // gli indici delle fontanelle cambiano
    punti = j.punti;
    quando = j.quando;
    try { localStorage.setItem(CHIAVE, JSON.stringify({ quando, punti })); } catch (e) { /* memoria piena */ }
  }

  async function scarica() {
    const domanda = '[out:json][timeout:60];(' +
      'nwr["amenity"="drinking_water"](' + RIQUADRO + ');' +
      'nwr["amenity"="fountain"]["drinking_water"="yes"](' + RIQUADRO + ');' +
      ');out center tags qt;';
    let ultimoErrore;
    for (const server of SERVER_OVERPASS) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 70000);
        const r = await fetch(server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(domanda),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const json = await r.json();
        const nuovi = [];
        for (const el of json.elements || []) {
          const lat = el.lat != null ? el.lat : el.center && el.center.lat;
          const lon = el.lon != null ? el.lon : el.center && el.center.lon;
          if (lat == null || lon == null) continue;
          const t = el.tags || {};
          if (t.access === 'private' || t.access === 'no' || t.access === 'customers') continue;
          let tipo = 'f';
          if (t.amenity === 'fountain') tipo = 'm';
          else if (t.fountain === 'nasone' || /nasone/i.test(t['drinking_water:type'] || '')) tipo = 'n';
          let extra = '';
          if (t.bottle === 'yes') extra += 'b';
          if (t.dog === 'yes') extra += 'c';
          if (t.wheelchair === 'yes') extra += 'r';
          else if (t.wheelchair === 'no') extra += 'x';
          if ((t.seasonal && t.seasonal !== 'no') || t.opening_hours) extra += 's';
          nuovi.push([+lat.toFixed(5), +lon.toFixed(5), tipo, t.name || '', '', extra]);
        }
        if (nuovi.length < 50) throw new Error('risposta troppo corta');
        if (navigando) finisciNavigazione();
        punti = nuovi;
        quando = Date.now();
        try { localStorage.setItem(CHIAVE, JSON.stringify({ quando, punti })); } catch (e) { /* memoria piena */ }
        return;
      } catch (e) { ultimoErrore = e; }
    }
    throw ultimoErrore || new Error('nessun server');
  }

  // ---------- Indirizzi ----------
  // La strada arriva già pronta dal dato (p[4]); Nominatim resta solo per i punti che non ce l'hanno.
  const stradaDi = (i) => punti[i][4] || strade.get(i) || '';
  let attesaStrada = null;
  function cercaStrada(i) {
    clearTimeout(attesaStrada);
    if (punti[i][4] || strade.has(i) || !navigator.onLine) return;
    attesaStrada = setTimeout(async () => {
      try {
        const p = punti[i];
        const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=it&lat=' + p[0] + '&lon=' + p[1]);
        if (!r.ok) return;
        const a = (await r.json()).address || {};
        strade.set(i, a.road || a.pedestrian || a.square || a.footway || a.path || a.park || a.neighbourhood || '');
        if (mostrata() === i) mostra();
      } catch (e) { /* senza indirizzo si mostra solo il tipo */ }
    }, 900);
  }

  // ---------- Mappa ----------
  const RASTER = {
    version: 8,
    sources: {
      osm: {
        type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }
    },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': '#e8ebe6' } },
      { id: 'osm', type: 'raster', source: 'osm' }
    ]
  };

  async function stileMappa() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch(STILE_MAPPA, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('stile');
      const stile = await r.json();
      // Via i simboli dei negozi e gli edifici in 3D: sulla mappa devono risaltare le fontanelle.
      const nascosti = ['poi_r20', 'poi_r7', 'poi_r1', 'building-3d'];
      stile.layers = stile.layers.filter((l) => nascosti.indexOf(l.id) === -1);
      return stile;
    } catch (e) {
      return RASTER; // se la mappa vettoriale non risponde si usa quella classica di OpenStreetMap
    }
  }

  function margini() {
    if (navigando) return marginiGuida();
    const alto = $('filtri').getBoundingClientRect().bottom;
    if (largo.matches) return { top: 20, bottom: 20, left: 420, right: 20 };
    // mentre ti segue, la mappa ti tiene un po' più in basso per mostrarti la strada davanti
    return { top: Math.round(alto), bottom: Math.round(visibile()), left: 0, right: 0 };
  }
  let marginiInSospeso = false;
  let inquadrata = false;    // vero finché l'utente non sposta la mappa dopo un'inquadratura
  function applicaMargini() {
    const m = margini();
    // in navigazione gli avvisi stanno sotto il banner delle indicazioni, non sotto i filtri
    const altoAvvisi = navigando ? Math.round($('guida').getBoundingClientRect().bottom) : m.top;
    document.documentElement.style.setProperty('--alto', altoAvvisi + 'px');
    document.documentElement.style.setProperty('--peek', (largo.matches ? 0 : visibile()) + 'px');
    if (!map) return;
    // Mai interrompere un movimento della mappa già in corso: si rimanda alla fine.
    if (map.isMoving()) { marginiInSospeso = true; return; }
    const p = map.getPadding();
    if (p.top !== m.top || p.bottom !== m.bottom || p.left !== m.left || p.right !== m.right) {
      // Se la mappa sta inquadrando te e la fontanella, si rifà l'inquadratura con i margini nuovi:
      // spostare solo i margini farebbe scivolare la fontanella sotto i filtri o sotto la scheda.
      if (navigando) seguiMappa(false);
      else if (inquadrata) { map.setPadding(m); inquadra(); }
      else map.easeTo({ padding: m, duration: 300 });
    }
  }

  async function creaMappa() {
    const style = await stileMappa();
    map = new maplibregl.Map({
      container: 'map',
      style: style,
      center: ROMA,
      zoom: 15.4,
      minZoom: 9,
      maxZoom: 19,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.setPadding(margini());

    // Si parte appena lo stile è letto, senza aspettare tutti i tasselli.
    let stilePronto = false;
    const stileLetto = new Promise((ok) => map.once('style.load', () => { stilePronto = true; ok(); }));
    await Promise.race([stileLetto, new Promise((ok) => setTimeout(ok, 6000))]);
    const quandoPronta = (f) => (stilePronto ? f() : stileLetto.then(f));
    quandoPronta(aggiungiStrati);

    map.on('click', (e) => {
      if (!mappaPronta || map.getZoom() >= ZOOM_SEGNI + 0.2) return;
      const q = map.queryRenderedFeatures(
        [[e.point.x - 16, e.point.y - 16], [e.point.x + 16, e.point.y + 16]], { layers: ['punti'] });
      if (!q.length) return;
      let migliore = q[0], min = Infinity;
      q.forEach((f) => {
        const c = map.project(f.geometry.coordinates);
        const d = Math.hypot(c.x - e.point.x, c.y - e.point.y);
        if (d < min) { min = d; migliore = f; }
      });
      scegli(migliore.properties.i);
    });

    // fuori navigazione il cono ruota insieme alla mappa; in navigazione ci pensa il ciclo della camera
    map.on('rotate', () => { if (!navigando) disegnaCono(); });
    // un gesto dell'utente sulla mappa interrompe l'inquadratura automatica
    // (un tocco breve non fa partire né dragstart né zoomstart: non interrompe nulla)
    ['dragstart', 'zoomstart'].forEach((ev) => map.on(ev, (e) => {
      if (!e.originalEvent) return;
      inquadrata = false;
      if (navigando) pausaSegui();
    }));

    let freno = 0;
    map.on('move', () => {
      const ora = Date.now();
      if (ora - freno > 180) { freno = ora; aggiornaSegni(); }
    });
    map.on('moveend', (e) => {
      if (e && e.camera) return;   // fotogrammi della camera di navigazione: nulla da ricalcolare
      if (marginiInSospeso) { marginiInSospeso = false; applicaMargini(); }
      aggiornaSegni();
      if (!punti.length || riferimento().mio) return;
      calcola();
      mostra();
    });
  }

  // Linea del percorso e punti delle fontanelle.
  function aggiungiStrati() {
    map.addSource('via', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'via-bordo', type: 'line', source: 'via',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.85 }
    });
    map.addLayer({
      id: 'via', type: 'line', source: 'via',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#1f2927', 'line-width': 4.5, 'line-dasharray': [0.01, 2] }
    });
    map.addSource('fontanelle', { type: 'geojson', data: geojson() });
    map.addLayer({
      id: 'punti', type: 'circle', source: 'fontanelle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.3, 12, 2.8, 14, 5, 15, 6.5],
        'circle-color': ['match', ['get', 't'], 'n', '#1f2927', 'm', '#c9972c', '#0b84b5'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 12, 0.9, 14, 1.8],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], ZOOM_SEGNI - 0.3, 1, ZOOM_SEGNI + 0.2, 0],
        'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], ZOOM_SEGNI - 0.3, 1, ZOOM_SEGNI + 0.2, 0]
      }
    });
    mappaPronta = true;
    aggiornaVia();
    aggiornaSegni();
  }

  function geojson() {
    return {
      type: 'FeatureCollection',
      features: punti.map((p, i) => ({
        type: 'Feature', properties: { i: i, t: p[2] },
        geometry: { type: 'Point', coordinates: [p[1], p[0]] }
      })).filter((f) => passa(f.properties.i))
    };
  }
  function ridisegnaPunti() {
    if (mappaPronta) map.getSource('fontanelle').setData(geojson());
    segni.forEach((m) => m.remove());
    segni.clear();
    aggiornaSegni();
  }

  // Segni animati: solo quelli nell'inquadratura, e solo da vicino.
  function creaSegno(i, scelto) {
    const p = punti[i];
    const el = document.createElement('div');
    el.className = 'segno t-' + p[2] + (scelto ? ' scelto' : '');
    el.style.setProperty('--sfasa', (-(i % 23) / 10) + 's');
    el.innerHTML = (scelto ? '<span class="cerchio"></span><span class="cerchio due"></span>' : '') +
      '<div class="bolla">' + glifo(p[2], true) + '</div>' +
      (scelto ? '<span class="etichetta">' + TIPI[p[2]].nome + '</span>' : '');
    if (!scelto) {
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', TIPI[p[2]].nome);
      el.addEventListener('click', (e) => { e.stopPropagation(); scegli(i); });
    }
    return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p[1], p[0]]).addTo(map);
  }

  function aggiornaSegni() {
    if (!map || !punti.length) return;
    const servono = new Set();
    if (map.getZoom() >= ZOOM_SEGNI) {
      const b = map.getBounds(), c = map.getCenter();
      const o = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
      let dentro = [];
      for (let i = 0; i < punti.length; i++) {
        const p = punti[i];
        if (p[0] < s || p[0] > n || p[1] < o || p[1] > e || !passa(i) || i === sceltoIndice) continue;
        dentro.push(i);
      }
      if (dentro.length > MAX_SEGNI) {
        dentro = dentro.map((i) => ({ i, d: metri(c.lat, c.lng, punti[i][0], punti[i][1]) }))
          .sort((a, b2) => a.d - b2.d).slice(0, MAX_SEGNI).map((x) => x.i);
      }
      dentro.forEach((i) => servono.add(i));
    }
    segni.forEach((m, i) => { if (!servono.has(i)) { m.remove(); segni.delete(i); } });
    let nuovi = 0;
    servono.forEach((i) => {
      if (segni.has(i)) return;
      const m = creaSegno(i, false);
      m.getElement().style.setProperty('--ritardo', Math.min(nuovi++ * 0.018, 0.45) + 's');
      segni.set(i, m);
    });
  }

  function segnaScelto(i) {
    if (!map || sceltoIndice === i) return;
    if (segnoScelto) segnoScelto.remove();
    sceltoIndice = i;
    if (segni.has(i)) { segni.get(i).remove(); segni.delete(i); }
    segnoScelto = creaSegno(i, true);
    aggiornaSegni();
  }

  function lineaVia() {
    const i = mostrata(), r = riferimento();
    if (i == null || !r.mio) return null;
    if (navigando && guida && prog) return lineaRestante();
    const fine = [punti[i][1], punti[i][0]], rt = percorsoValido(i, r);
    return rt ? [[r.lon, r.lat]].concat(rt.geom, [fine]) : [[r.lon, r.lat], fine];
  }
  function aggiornaVia() {
    if (!mappaPronta) return;
    const linea = lineaVia();
    const dati = { type: 'FeatureCollection', features: [] };
    if (linea) dati.features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: linea } });
    map.getSource('via').setData(dati);
  }

  // ---------- Percorsi a piedi veri ----------
  // La linea d'aria inganna: un raccordo o un fiume possono allungare molto la strada.
  // Si chiede il percorso a piedi per le candidate più vicine e si sceglie la più vicina camminando.
  const percorsi = new Map();   // indice -> {d, geom, o: {lat, lon}, dritta} oppure {errore, t}
  const percorsiInCorso = new Set();
  let percorsiFalliti = 0;
  function percorsoValido(i, r) {
    const rt = percorsi.get(i);
    if (!rt || rt.errore || !r.mio || metri(rt.o.lat, rt.o.lon, r.lat, r.lon) > 120) return null;
    return rt;
  }
  // Distanza da mostrare: a piedi se c'è il percorso, altrimenti in linea d'aria.
  function distanzaVera(i, r) {
    const p = punti[i], dritta = metri(r.lat, r.lon, p[0], p[1]);
    // in navigazione: quanto resta lungo il percorso guidato
    if (navigando && i === meta && guida && prog) return { d: Math.max(0, guida.tot - prog.cum) + prog.off, aPiedi: true };
    const rt = percorsoValido(i, r);
    if (!rt) return { d: dritta, aPiedi: false };
    // mentre cammini si corregge con quanto ti sei avvicinato, senza richiedere il percorso a ogni passo
    return { d: Math.max(dritta, rt.d + dritta - rt.dritta), aPiedi: true };
  }
  let attesaRicalcolo = null;
  function chiediPercorsi(indici) {
    const r = riferimento();
    // in navigazione il percorso lo gestisce la guida, con meno richieste
    if (navigando || !r.mio || !navigator.onLine || percorsiFalliti >= 3) return;
    indici.forEach((i) => {
      if (percorsiInCorso.has(i)) return;
      const rt = percorsi.get(i);
      if (rt && rt.errore && Date.now() - rt.t < 60000) return;
      if (rt && !rt.errore && metri(rt.o.lat, rt.o.lon, r.lat, r.lon) < 50) return;
      const p = punti[i], o = { lat: r.lat, lon: r.lon };
      if (metri(o.lat, o.lon, p[0], p[1]) > 5000) return;   // oltre, a piedi non ha senso
      percorsiInCorso.add(i);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      fetch(SERVER_PERCORSI + o.lon + ',' + o.lat + ';' + p[1] + ',' + p[0] + '?overview=full&geometries=geojson', { signal: ctrl.signal })
        .then((risp) => (risp.ok ? risp.json() : Promise.reject(new Error('HTTP ' + risp.status))))
        .then((j) => {
          const via = j && j.code === 'Ok' && j.routes && j.routes[0];
          if (!via) throw new Error('nessun percorso');
          percorsi.set(i, { d: via.distance, geom: via.geometry.coordinates, o, dritta: metri(o.lat, o.lon, p[0], p[1]) });
          percorsiFalliti = 0;
        })
        .catch(() => {
          percorsi.set(i, { errore: true, t: Date.now() });
          // se il servizio non risponde per tre volte di fila si resta sulla linea d'aria
          percorsiFalliti++;
          if (percorsiFalliti === 3) setTimeout(() => { percorsiFalliti = 0; }, 5 * 60e3);
        })
        .finally(() => {
          clearTimeout(timer);
          percorsiInCorso.delete(i);
          clearTimeout(attesaRicalcolo);
          attesaRicalcolo = setTimeout(() => { if (punti.length) aggiorna(); }, 120);
        });
    });
  }

  // ---------- Fontanella più vicina ----------
  function riferimento() {
    if (io && !ioLontano) return { lat: io.lat, lon: io.lon, mio: true };
    const c = map ? map.getCenter() : { lat: ROMA[1], lng: ROMA[0] };
    return { lat: c.lat, lon: c.lng, mio: false };
  }
  function calcola() {
    if (!punti.length) return;
    const r = riferimento(), tutte = [];
    for (let i = 0; i < punti.length; i++) {
      if (passa(i)) tutte.push({ i, d: metri(r.lat, r.lon, punti[i][0], punti[i][1]) });
    }
    tutte.sort((a, b) => a.d - b.d);
    // le più vicine in linea d'aria, riordinate con la distanza a piedi quando è nota
    vicine = tutte.slice(0, 8).map((v) => Object.assign({ i: v.i }, distanzaVera(v.i, r)))
      .sort((a, b) => a.d - b.d).slice(0, 7);
    if (r.mio) chiediPercorsi(tutte.slice(0, 3).map((v) => v.i));
  }
  function mostrata() {
    if (navigando && meta != null) return meta;
    return fissata != null && passa(fissata) ? fissata : (vicine[0] ? vicine[0].i : null);
  }

  function scegli(i) {
    if (navigando) return;   // in navigazione la destinazione non cambia
    fissata = i;
    if (stato === 'mini') imposta('media');
    mostra();
    inquadra();
  }

  // Numero che scorre fino al nuovo valore.
  let giro = 0;
  function animaNumero(da, a) {
    const el = $('dist-num'), mio = ++giro, inizio = performance.now(), durata = 550;
    const decimali = a % 1 !== 0;
    (function passo(ora) {
      if (mio !== giro) return;
      const k = Math.min(1, (ora - inizio) / durata), e = 1 - Math.pow(1 - k, 3);
      const v = da + (a - da) * e;
      el.textContent = cifre(decimali ? v.toFixed(1) : Math.round(v / 5) * 5);
      if (k < 1) requestAnimationFrame(passo); else el.textContent = cifre(a);
    })(inizio);
  }

  let ultimoValore = 0, ultimaUnita = 'm', ultimoTipo = null, ultimiServizi = null;
  // Piccoli chip con ciò che offre la fontanella: borraccia, cani, carrozzina, stagionale.
  const SERVIZI = [
    ['b', 'Borraccia', 'si riempie bene una borraccia',
      '<path d="M9.5 3h5v2.2l-.6.9h-3.8l-.6-.9zM8.5 8h7a1.5 1.5 0 0 1 1.5 1.5v9.2a2.3 2.3 0 0 1-2.3 2.3H9.3A2.3 2.3 0 0 1 7 18.7V9.5A1.5 1.5 0 0 1 8.5 8zM7 12.5h10"/>'],
    ['c', 'Cani', 'c\u2019\u00e8 una ciotola per i cani',
      '<path d="M5 10.5c-1.3-.3-2-1.5-1.5-3S5.3 6 6.5 6.8M19 10.5c1.3-.3 2-1.5 1.5-3S18.7 6 17.5 6.8M12 20c-3.2 0-5.3-1.6-5.3-4 0-2.8 1.8-5.4 3.3-6.6C10.8 8.5 11.4 8 12 8s1.2.5 2 1.400c1.5 1.2 3.3 3.8 3.3 6.6 0 2.4-2.1 4-5.3 4zM10 14.200v.3M14 14.200v.3M12 16.500v.8"/>'],
    ['r', 'Carrozzina', 'accessibile in carrozzina',
      '<circle cx="10" cy="4.5" r="1.6"/><path d="M10 7.500v5h5l2.5 5.500M10 10h4.500M7.5 11.500a5 5 0 1 0 7 6.5"/>'],
    ['x', 'Non in carrozzina', 'non accessibile in carrozzina',
      '<circle cx="10" cy="4.5" r="1.6"/><path d="M10 7.500v5h5l2.5 5.500M10 10h4.500M7.5 11.500a5 5 0 1 0 7 6.500M3.5 3.500l17 17"/>'],
    ['s', 'Stagionale', 'può essere chiusa in certi periodi',
      '<circle cx="12" cy="12" r="8"/><path d="M12 7.500V12l3 2"/>']
  ];
  function mostraServizi(extra) {
    if (extra === ultimiServizi) return;
    ultimiServizi = extra;
    const ul = $('servizi');
    ul.textContent = '';
    SERVIZI.forEach((s) => {
      if (extra.indexOf(s[0]) < 0) return;
      const li = document.createElement('li');
      li.className = 'chip chip-' + s[0];
      li.title = s[2].charAt(0).toUpperCase() + s[2].slice(1);
      li.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + s[3] + '</svg>';
      const t = document.createElement('span');
      t.textContent = s[1];
      li.appendChild(t);
      li.setAttribute('aria-label', s[2]);
      ul.appendChild(li);
    });
    ul.hidden = !ul.children.length;
  }
  function mostra() {
    const i = mostrata();
    if (i == null) {
      $('scheda').classList.add('nascosta');
      return;
    }
    const p = punti[i], r = riferimento(), tipo = TIPI[p[2]];
    if (navigando) aggiornaProgresso();
    const vera = distanzaVera(i, r), d = vera.d;
    if (r.mio) chiediPercorsi([i]);
    const rt = percorsi.get(i);
    const inLinea = r.mio && !vera.aPiedi && rt && rt.errore ? ' in linea d\u2019aria' : '';
    const dist = distanza(d);
    const cambiata = i !== ultimaMostrata;

    $('scheda').classList.remove('nascosta');
    $('mirino').hidden = r.mio;

    const arrivato = r.mio && d < SOGLIA_ARRIVO;
    $('contesto').textContent = arrivato ? 'Ci sei, è qui accanto'
      : navigando ? 'Stai andando qui'
      : fissata != null ? 'Hai scelto'
      : (r.mio ? 'La più vicina a te' : 'La più vicina al centro');
    $('btn-sblocca').hidden = fissata == null || navigando;

    if (cambiata && dist.u === ultimaUnita && ultimaMostrata != null) animaNumero(ultimoValore, dist.v);
    else { giro++; $('dist-num').textContent = cifre(dist.v); }
    $('dist-unita').textContent = dist.u;
    ultimoValore = dist.v; ultimaUnita = dist.u;

    const strada = stradaDi(i);
    $('titolo').textContent = p[3] || strada || tipo.nome;
    $('dettaglio').textContent = ((p[3] || strada) ? tipo.nome + ', ' : '') + minuti(d) + inLinea + ', verso ' + verso(r.lat, r.lon, p[0], p[1]);
    $('spiega').textContent = tipo.spiega;
    mostraServizi(p[5] || '');
    if (p[2] !== ultimoTipo) { $('figura').innerHTML = figura(p[2]); ultimoTipo = p[2]; }

    let nota = '';
    if (io && ioLontano) nota = 'Sei lontano da Roma. Sposta la mappa per esplorare una zona.';
    else if (gpsNegato) nota = 'Posizione non attiva. Sposta la mappa, oppure tocca la freccia a destra per riprovare.';
    else if (r.mio && io.acc > GPS_INCERTO) nota = 'Posizione approssimativa (circa ' + Math.round(io.acc / 10) * 10 + ' m): la più vicina potrebbe essere un\u2019altra. All\u2019aperto il GPS diventa più preciso.';
    $('nota').textContent = nota;
    $('nota').hidden = !nota;

    $('btn-esterno').href = $('mini-vai').href = suApple
      ? 'https://maps.apple.com/?daddr=' + p[0] + ',' + p[1] + '&dirflg=w'
      : 'https://www.google.com/maps/dir/?api=1&destination=' + p[0] + ',' + p[1] + '&travelmode=walking';
    aggiornaPulsantiVai(r.mio);
    if (navigando && arrivato && !arrivoFatto) arrivo(p[2]);

    // Barra compatta
    $('mini-num').textContent = cifre(dist.v);
    $('mini-unita').textContent = dist.u;
    $('mini-titolo').textContent = $('titolo').textContent;
    miniTesto = arrivato ? 'Ci sei' : navigando ? minuti(d).replace(' a piedi', '') + ' \u00b7 arrivo alle ' + orario(d) : minuti(d);
    rottaVerso = gradiVerso(r.lat, r.lon, p[0], p[1]);
    aggiornaFreccia();

    ultimaMostrata = i;
    segnaScelto(i);
    aggiornaVia();
    // Se la fontanella o il suo percorso cambiano e non hai toccato la mappa, l'inquadratura li segue.
    if (inquadrata && chiaveInquadra() !== ultimaInquadra) inquadra();
    cercaStrada(i);
    riempiElenco();
    misuraScheda();
    if (navigando) aggiornaGuida();
  }

  function riempiElenco() {
    const r = riferimento(), attuale = mostrata(), ol = $('elenco');
    ol.textContent = '';
    vicine.filter((v) => v.i !== attuale).slice(0, 6).forEach((v) => {
      const p = punti[v.i], dist = distanza(v.d), tipo = TIPI[p[2]];
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'voce';
      const mini = document.createElement('span');
      mini.className = 'mini t-' + p[2];
      mini.innerHTML = glifo(p[2], false);
      const cosa = document.createElement('span');
      cosa.className = 'cosa';
      cosa.textContent = p[3] || stradaDi(v.i) || tipo.nome;
      const piccolo = document.createElement('small');
      piccolo.textContent = minuti(v.d) + ', verso ' + verso(r.lat, r.lon, p[0], p[1]);
      cosa.appendChild(piccolo);
      const quanto = document.createElement('span');
      quanto.className = 'quanto';
      quanto.textContent = cifre(dist.v);
      const unita = document.createElement('span');
      unita.textContent = dist.u;
      quanto.appendChild(unita);
      b.append(mini, cosa, quanto);
      b.addEventListener('click', () => { apri(false); scegli(v.i); });
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  function aggiorna() { calcola(); mostra(); }

  // ---------- Navigazione "Vai" ----------
  // Pulsante principale: "Vai" (naviga dentro Sete), "Termina" durante la navigazione.
  // Senza posizione GPS "Vai" non ha senso: resta solo il link al navigatore esterno.
  const ICONA_PASSO = '<circle cx="13" cy="4.2" r="2.2" fill="currentColor"/><path d="M13.5 8.5 10 10.2l-1.2 4M13.5 8.5l1.2 4.3 3 1.7M13.5 8.5l-1.3 6-3.2 5.5M12.2 14.5l3 2.5.8 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>';
  function aggiornaPulsantiVai(conPosizione) {
    conPosizione = conPosizione && NAVIGAZIONE_INTERNA;
    $('btn-vai').hidden = !conPosizione;
    $('btn-vai').classList.toggle('fine', navigando);
    $('vai-testo').textContent = navigando ? 'Termina' : 'Vai';
    $('btn-vai').setAttribute('aria-label', navigando ? 'Termina la navigazione' : 'Vai alla fontanella, con le indicazioni dentro Sete');
    $('vai-icona').style.display = navigando ? 'none' : '';
    $('btn-esterno').classList.toggle('secondario', conPosizione);
    $('esterno-testo').textContent = conPosizione ? (suApple ? 'Apri in Mappe' : 'Apri in Google Maps') : 'Indicazioni a piedi';
    // barra compatta: avvia o termina, oppure il link esterno se manca la posizione
    $('mini-vai').hidden = conPosizione;
    $('mini-azione').hidden = !conPosizione;
    $('mini-azione').classList.toggle('fine', navigando);
    $('mini-azione').setAttribute('aria-label', navigando ? 'Termina la navigazione' : 'Vai alla fontanella');
    $('mini-azione-icona').innerHTML = navigando
      ? '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
      : ICONA_PASSO;
    $('btn-centra').classList.toggle('fuori', navigando && !seguendo);
  }

  async function tieniSchermoAcceso() {
    try {
      if (!navigando || !navigator.wakeLock || bloccoSchermo || document.visibilityState !== 'visible') return;
      const b = await navigator.wakeLock.request('screen');
      if (!navigando) { b.release().catch(() => {}); return; }
      bloccoSchermo = b;
      b.addEventListener('release', () => { if (bloccoSchermo === b) bloccoSchermo = null; });
    } catch (e) { /* schermo non bloccabile: pazienza */ }
  }
  function lasciaSchermo() {
    try {
      const b = bloccoSchermo;
      bloccoSchermo = null;
      if (b) b.release().catch(() => {});
    } catch (e) { /* niente */ }
  }
  document.addEventListener('visibilitychange', () => { if (navigando) tieniSchermoAcceso(); });

  // ---------- Navigazione guidata ----------
  // Mentre cammini la mappa si inclina, ruota nella direzione del percorso e ti segue, con te in basso
  // e la strada davanti. In alto un banner dice la prossima svolta; lungo la strada si indicano i luoghi notevoli.
  let guida = null;          // {geom, cum, tot, passi: [{tipo, mod, nome, uscita, at}], t}
  let guidaInCorso = false, ultimaRichiestaGuida = 0;
  let prog = null;           // posizione sul percorso: {cum, off, seg}
  let passoDetto = -1, passoVibrato = -1;
  let voce = false;
  try { voce = localStorage.getItem(CHIAVE_VOCE) === '1'; } catch (e) { /* niente */ }

  function orario(d) {
    const t = new Date(Date.now() + Math.max(1, Math.round(d / METRI_AL_MINUTO)) * 60e3);
    return t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0');
  }
  function parla(testo) {
    if (!voce || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(testo);
      u.lang = 'it-IT';
      u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch (e) { /* voce non disponibile */ }
  }
  function vibra(schema) {
    if (navigator.vibrate) { try { navigator.vibrate(schema); } catch (e) { /* niente */ } }
  }

  // Geometria del percorso in metri, con un piano locale: basta e avanza per qualche chilometro.
  function piano(lat, lon) {
    return [lon * RAD * Math.cos(41.9 * RAD) * 6371000, lat * RAD * 6371000];
  }
  function preparaGuida(via) {
    const geom = via.geometry.coordinates, cum = [0];
    for (let k = 1; k < geom.length; k++) cum.push(cum[k - 1] + metri(geom[k - 1][1], geom[k - 1][0], geom[k][1], geom[k][0]));
    const tot = cum[cum.length - 1];
    const passi = [], scala = via.distance > 0 ? tot / via.distance : 1;
    let somma = 0;
    ((via.legs && via.legs[0] && via.legs[0].steps) || []).forEach((st) => {
      const m = st.maneuver || {};
      passi.push({ tipo: m.type || '', mod: m.modifier || '', nome: st.name || '', uscita: m.exit, at: somma * scala });
      somma += st.distance || 0;
    });
    return { geom, cum, tot, passi, t: Date.now() };
  }
  // Dove sei sul percorso: il punto più vicino della linea, quanti metri ne hai percorsi e quanto ne sei lontano.
  function progressoSu(lat, lon) {
    const g = guida.geom, q = piano(lat, lon);
    let migliore = { cum: 0, off: Infinity, seg: 0 };
    for (let k = 0; k < g.length - 1; k++) {
      const a = piano(g[k][1], g[k][0]), b = piano(g[k + 1][1], g[k + 1][0]);
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
      const off = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
      if (off < migliore.off) migliore = { cum: guida.cum[k] + t * (guida.cum[k + 1] - guida.cum[k]), off, seg: k };
    }
    return migliore;
  }
  function puntoA(cum) {
    const g = guida.geom, c = guida.cum;
    if (cum <= 0) return g[0];
    for (let k = 0; k < g.length - 1; k++) {
      if (c[k + 1] >= cum) {
        const t = c[k + 1] > c[k] ? (cum - c[k]) / (c[k + 1] - c[k]) : 0;
        return [g[k][0] + t * (g[k + 1][0] - g[k][0]), g[k][1] + t * (g[k + 1][1] - g[k][1])];
      }
    }
    return g[g.length - 1];
  }
  function lineaRestante() {
    const fine = [punti[meta][1], punti[meta][0]];
    return [[io.lon, io.lat], puntoA(prog.cum)].concat(guida.geom.slice(prog.seg + 1), [fine]);
  }
  function aggiornaProgresso() {
    prog = guida && io ? progressoSu(io.lat, io.lon) : null;
  }
  // Direzione in cui stai camminando: quella del percorso davanti a te, altrimenti la bussola o la meta.
  function direzioneMarcia() {
    if (guida && prog && prog.off < FUORI_PERCORSO) {
      const a = puntoA(prog.cum), b = puntoA(Math.min(guida.tot, prog.cum + 25));
      if (a[0] !== b[0] || a[1] !== b[1]) return gradiVerso(a[1], a[0], b[1], b[0]);
    }
    if (rotta != null) return rotta;
    if (meta != null && io) return gradiVerso(io.lat, io.lon, punti[meta][0], punti[meta][1]);
    return null;
  }

  function chiediGuida() {
    if (!navigando || guidaInCorso || !io || meta == null || !navigator.onLine) return;
    guidaInCorso = true;
    ultimaRichiestaGuida = Date.now();
    const p = punti[meta], mio = meta, ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(SERVER_PERCORSI + io.lon + ',' + io.lat + ';' + p[1] + ',' + p[0] + '?overview=full&geometries=geojson&steps=true', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((j) => {
        const via = j && j.code === 'Ok' && j.routes && j.routes[0];
        if (!via || !navigando || meta !== mio) return;
        guida = preparaGuida(via);
        passoDetto = -1; passoVibrato = -1;
        scegliLuoghiVia();
        aggiornaProgresso();
        mostra();
        seguiMappa(false);
      })
      .catch(() => { /* resta la guida di prima, o la freccia verso la meta */ })
      .finally(() => { clearTimeout(timer); guidaInCorso = false; if (navigando) aggiornaGuida(); });
  }

  // ---------- Banner delle indicazioni ----------
  const FRECCE = {
    dritto: '<path d="M24 41V9M13 19 24 8l11 11"/>',
    svolta: '<path d="M17 41V26c0-4.4 3.6-8 8-8h13M30 10l8 8-8 8"/>',
    leggera: '<path d="M18 41V28.5c0-2 .8-3.900 2.200-5.300L34 9.500M24 9h11v11"/>',
    stretta: '<path d="M16 41V12M16 14.500 33 31.500M35 20v13H22"/>',
    inversione: '<path d="M31 41V20a8 8 0 0 0-16 0v14M8 27l7 7.500 7-7.500"/>',
    rotonda: '<circle cx="24" cy="19" r="7.500"/><path d="M24 41V26.500M30.500 15.500 37 9M29 9h8v8"/>'
  };
  const GOCCIA = '<path d="M24 6S12 20.500 12 28.500a12 12 0 0 0 24 0C36 20.500 24 6 24 6Z" fill="currentColor" stroke="none"/><path d="M19 29a5 5 0 0 0 5 5" stroke="#1f2927"/>';
  function iconaPasso(p) {
    if (!p) return FRECCE.dritto;
    if (p.tipo === 'arrive') return GOCCIA;
    if (/roundabout|rotary/.test(p.tipo)) return FRECCE.rotonda;
    const m = p.mod;
    const base = m === 'uturn' ? FRECCE.inversione
      : /sharp/.test(m) ? FRECCE.stretta
      : /slight/.test(m) ? FRECCE.leggera
      : /left|right/.test(m) ? FRECCE.svolta : FRECCE.dritto;
    // le svolte a sinistra sono le stesse frecce specchiate
    return /left/.test(m) && m !== 'uturn' ? '<g transform="matrix(-1 0 0 1 48 0)">' + base + '</g>' : base;
  }
  function verbo(m) {
    return ({
      left: 'Gira a sinistra', right: 'Gira a destra',
      'slight left': 'Tieni la sinistra', 'slight right': 'Tieni la destra',
      'sharp left': 'Svolta stretta a sinistra', 'sharp right': 'Svolta stretta a destra',
      uturn: 'Torna indietro', straight: 'Prosegui dritto'
    })[m] || 'Prosegui';
  }
  function frasePasso(p) {
    if (!p) return '';
    const inVia = p.nome ? ' in ' + p.nome : '', suVia = p.nome ? ' su ' + p.nome : '';
    if (p.tipo === 'arrive') return 'La fontanella è ' + (/right/.test(p.mod) ? 'sulla destra' : /left/.test(p.mod) ? 'sulla sinistra' : 'davanti a te');
    if (/roundabout|rotary/.test(p.tipo)) return 'Alla rotonda prendi la ' + (p.uscita ? p.uscita + '\u00aa ' : '') + 'uscita' + inVia;
    if (p.tipo === 'depart') return 'Parti' + suVia;
    if ((p.tipo === 'continue' || p.tipo === 'new name') && (!p.mod || p.mod === 'straight')) return 'Prosegui' + suVia;
    return verbo(p.mod) + (p.mod === 'straight' ? suVia : inVia);
  }
  const minuscola = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  function scriviBanner(icona, dist, frase, poi, ruota) {
    const svg = $('guida-svg');
    if (svg.dataset.icona !== icona) { svg.innerHTML = icona; svg.dataset.icona = icona; }
    svg.style.transform = ruota ? 'rotate(' + ruota.toFixed(0) + 'deg)' : '';
    if ($('guida-dist').textContent !== dist) $('guida-dist').textContent = dist;
    if ($('guida-frase').textContent !== frase) $('guida-frase').textContent = frase;
    $('guida-poi').hidden = !poi;
    if (poi && $('guida-poi').textContent !== poi) $('guida-poi').textContent = poi;
  }
  function aggiornaGuida() {
    if (!navigando || meta == null || !io) return;
    orientaFreccia();
    const p = punti[meta];
    if (!guida) {
      // senza indicazioni (servizio lento o assente): una freccia verso la fontanella
      const dir = gradiVerso(io.lat, io.lon, p[0], p[1]);
      const d = distanza(metri(io.lat, io.lon, p[0], p[1]));
      scriviBanner(FRECCE.dritto, cifre(d.v) + ' ' + d.u,
        guidaInCorso ? 'Cerco la strada migliore\u2026' : 'Vai verso ' + verso(io.lat, io.lon, p[0], p[1]), '',
        dir - (map ? map.getBearing() : 0));
      if (!guidaInCorso && Date.now() - ultimaRichiestaGuida > 15000) chiediGuida();
      annunciaLuoghi();
      return;
    }
    if (prog.off > FUORI_PERCORSO) {
      scriviBanner(FRECCE.inversione, '', 'Sei fuori strada: ricalcolo il percorso\u2026', '');
      if (Date.now() - ultimaRichiestaGuida > 10000) chiediGuida();
      annunciaLuoghi();
      return;
    }
    // prossima manovra: la prima più avanti di dove sei (la partenza non conta)
    let k = guida.passi.findIndex((ps, n) => n > 0 && ps.at > prog.cum + 3);
    if (k < 0) k = guida.passi.length - 1;
    const ps = guida.passi[k], dm = Math.max(0, (ps ? ps.at : guida.tot) - prog.cum);
    const dd = distanza(dm);
    const frase = frasePasso(ps);
    const dopo = guida.passi[k + 1];
    const poi = dopo && dopo.at - ps.at < 60 ? 'Poi ' + minuscola(frasePasso(dopo)) : '';
    scriviBanner(iconaPasso(ps), dm < 10 ? 'Ora' : cifre(dd.v) + ' ' + dd.u, frase, poi);
    // voce e vibrazione prima della svolta
    if (ps && ps.tipo !== 'arrive') {
      if (dm <= 45 && dm > 14 && passoDetto !== k) { passoDetto = k; parla('Tra ' + Math.round(dm / 5) * 5 + ' metri, ' + minuscola(frase)); }
      if (dm <= 14 && passoVibrato !== k) { passoVibrato = k; passoDetto = k; vibra([40, 60, 40]); parla(frase); }
    }
    annunciaLuoghi();
  }

  // ---------- Luoghi notevoli lungo la strada ----------
  let luoghiTutti = null, luoghiInCarico = false;
  let luoghiVia = [];        // [{l, fatto}] vicini al percorso
  const segniLuoghi = [];
  let luogoAperto = null, luogoDa = 0, attesaLuogo = null;
  const riassunti = new Map();
  const ICONE_LUOGO = {
    c: '<path d="M12 3v6M9.500 5.500h5M6 21v-8l6-4 6 4v8zM10.500 21v-4h3v4"/>',
    m: '<path d="M4 9.500 12 5l8 4.500M5 21h14M7 11v7M12 11v7M17 11v7M4.500 9.500h15"/>',
    p: '<path d="M12 21v-5M7.500 16h9L12 4z"/>',
    f: '<path d="M12 4s-5 6-5 9.500a5 5 0 0 0 10 0C17 10 12 4 12 4z"/>',
    q: '<rect x="5" y="5" width="14" height="14" rx="2"/><circle cx="12" cy="12" r="2.500"/>',
    v: '<path d="M2.500 12S6 6 12 6s9.500 6 9.500 6-3.500 6-9.500 6-9.500-6-9.500-6z"/><circle cx="12" cy="12" r="2.500"/>',
    n: '<path d="M10 21V8l2-4 2 4v13M8 21h8"/>'
  };
  function iconaLuogo(g) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONE_LUOGO[g] || ICONE_LUOGO.n) + '</svg>';
  }
  async function caricaLuoghi() {
    if (luoghiTutti || luoghiInCarico) return;
    luoghiInCarico = true;
    try {
      const r = await fetch(LUOGHI);
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.luoghi)) luoghiTutti = j.luoghi;
      }
    } catch (e) { /* senza luoghi la navigazione funziona lo stesso */ }
    luoghiInCarico = false;
    if (navigando) scegliLuoghiVia();
  }
  // Si tengono i luoghi a meno di 80 m dal percorso (dal bordo, per quelli grandi), al massimo 25.
  function scegliLuoghiVia() {
    togliSegniLuoghi();
    luoghiVia = [];
    if (!luoghiTutti || !guida) return;
    const g = guida.geom;
    let s = Infinity, n = -Infinity, o = Infinity, e = -Infinity;
    g.forEach((c) => { s = Math.min(s, c[1]); n = Math.max(n, c[1]); o = Math.min(o, c[0]); e = Math.max(e, c[0]); });
    const m = 0.003;
    const vicini = [];
    luoghiTutti.forEach((l) => {
      if (l[0] < s - m || l[0] > n + m || l[1] < o - m || l[1] > e + m) return;
      let min = Infinity;
      const q = piano(l[0], l[1]);
      for (let k = 0; k < g.length - 1; k++) {
        const a = piano(g[k][1], g[k][0]), b = piano(g[k + 1][1], g[k + 1][0]);
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
        min = Math.min(min, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
      }
      if (min - l[4] < 80) vicini.push({ l, d: min - l[4], fatto: false });
    });
    vicini.sort((a, b) => a.d - b.d);
    luoghiVia = vicini.slice(0, 25);
    luoghiVia.forEach((v) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'segno-luogo';
      el.innerHTML = '<span class="segno-luogo-icona">' + iconaLuogo(v.l[5]) + '</span><span class="segno-luogo-nome"></span>';
      el.querySelector('.segno-luogo-nome').textContent = v.l[2];
      el.setAttribute('aria-label', v.l[2]);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); mostraLuogo(v.l, null); });
      // il contenitore lo muove la mappa, il pulsante dentro si anima
      const ancora = document.createElement('div');
      ancora.className = 'segno-luogo-ancora';
      ancora.appendChild(el);
      segniLuoghi.push(new maplibregl.Marker({ element: ancora, anchor: 'bottom' }).setLngLat([v.l[1], v.l[0]]).addTo(map));
    });
  }
  function togliSegniLuoghi() {
    segniLuoghi.forEach((m) => m.remove());
    segniLuoghi.length = 0;
  }
  function annunciaLuoghi() {
    // un luogo nuovo può prendere il posto di quello mostrato, ma solo dopo qualche secondo
    if (!luoghiVia.length || !io || (luogoAperto && Date.now() - luogoDa < 6000)) return;
    const dir = direzioneMarcia();
    let scelto = null;
    luoghiVia.forEach((v) => {
      if (v.fatto) return;
      const d = metri(io.lat, io.lon, v.l[0], v.l[1]) - v.l[4];
      if (d > VICINO_LUOGO) return;
      const rel = dir == null ? 0 : ((gradiVerso(io.lat, io.lon, v.l[0], v.l[1]) - dir) % 360 + 540) % 360 - 180;
      // già alle spalle: non si annuncia più
      if (Math.abs(rel) > 140 && d > 5) { v.fatto = true; return; }
      if (!scelto || d < scelto.d) scelto = { v, d, rel };
    });
    if (!scelto) return;
    scelto.v.fatto = true;
    const lato = scelto.d <= 5 ? 'Ci sei in mezzo'
      : Math.abs(scelto.rel) < 35 ? 'Davanti a te'
      : scelto.rel > 0 ? 'Alla tua destra' : 'Alla tua sinistra';
    mostraLuogo(scelto.v.l, lato);
    parla(lato + ', ' + scelto.v.l[2]);
  }
  async function riassunto(wiki) {
    if (riassunti.has(wiki)) return riassunti.get(wiki);
    const i = wiki.indexOf(':'), lingua = wiki.slice(0, i), titolo = wiki.slice(i + 1).replace(/ /g, '_');
    const pagina = 'https://' + lingua + '.m.wikipedia.org/wiki/' + encodeURIComponent(titolo);
    let esito = { pagina };
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch('https://' + lingua + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(titolo), { signal: ctrl.signal });
      clearTimeout(timer);
      if (r.ok) {
        const j = await r.json();
        let testo = (j.extract || '').replace(/\s*\([^)]*\)/g, '');
        const fine = testo.search(/[.!?](\s|$)/);
        if (fine > 20) testo = testo.slice(0, fine + 1);
        if (testo.length > 170) testo = testo.slice(0, 167).replace(/\s\S*$/, '') + '\u2026';
        esito = { pagina: (j.content_urls && j.content_urls.mobile && j.content_urls.mobile.page) || pagina, testo, foto: j.thumbnail && j.thumbnail.source };
      }
    } catch (e) { /* senza descrizione: resta il nome */ }
    riassunti.set(wiki, esito);
    return esito;
  }
  async function mostraLuogo(l, lato) {
    luogoAperto = l;
    luogoDa = Date.now();
    clearTimeout(attesaLuogo);
    $('luogo-lato').textContent = lato || 'Lungo la strada';
    $('luogo-nome').textContent = l[2];
    $('luogo-descr').textContent = '';
    $('luogo-img').innerHTML = iconaLuogo(l[5]);
    $('luogo-img').classList.remove('foto');
    $('luogo-link').href = 'https://' + l[3].slice(0, l[3].indexOf(':')) + '.m.wikipedia.org/wiki/' + encodeURIComponent(l[3].slice(l[3].indexOf(':') + 1).replace(/ /g, '_'));
    $('luogo').hidden = false;
    applicaMargini();
    attesaLuogo = setTimeout(chiudiLuogo, 12000);
    if (!navigator.onLine) return;
    const r = await riassunto(l[3]);
    if (luogoAperto !== l) return;
    if (r.testo) $('luogo-descr').textContent = r.testo;
    $('luogo-link').href = r.pagina;
    if (r.foto) {
      const img = new Image();
      img.alt = '';
      img.onload = () => { if (luogoAperto !== l) return; $('luogo-img').textContent = ''; $('luogo-img').appendChild(img); $('luogo-img').classList.add('foto'); };
      img.src = r.foto;
    }
  }
  function chiudiLuogo() {
    clearTimeout(attesaLuogo);
    luogoAperto = null;
    $('luogo').hidden = true;
  }
  $('luogo-chiudi').addEventListener('click', chiudiLuogo);

  // ---------- Camera della navigazione ----------
  function marginiGuida() {
    const h = map ? map.getContainer().clientHeight : window.innerHeight;
    // tu stai nel terzo basso dello schermo, la strada davanti occupa il resto
    return { top: Math.round(h * 0.42), bottom: Math.round(visibile()) + 16, left: 0, right: 0 };
  }
  // In navigazione la linea diventa piena e azzurra, ben visibile anche in prospettiva.
  function stileVia(guidata) {
    if (!mappaPronta) return;
    try {
      map.setPaintProperty('via', 'line-color', guidata ? '#1c8fd0' : '#1f2927');
      map.setPaintProperty('via', 'line-width', guidata ? ['interpolate', ['linear'], ['zoom'], 14, 5, 18, 11] : 4.5);
      map.setPaintProperty('via', 'line-dasharray', guidata ? [1, 0] : [0.01, 2]);
      map.setPaintProperty('via-bordo', 'line-width', guidata ? ['interpolate', ['linear'], ['zoom'], 14, 8, 18, 17] : 8);
      map.setPaintProperty('via-bordo', 'line-opacity', guidata ? 1 : 0.85);
    } catch (e) { /* stile non ancora pronto */ }
  }
  // La camera non salta a ogni lettura del GPS: un ciclo a ogni fotogramma avvicina in modo morbido
  // centro, direzione, zoom, inclinazione e margini ai valori voluti, e tiene il segno dell'utente
  // fermo nel terzo basso dello schermo.
  let cam = null;              // stato della camera: { bear, pitch, zoom, top, bottom, scLon, scLat, giro }
  let visto = null;            // posizione mostrata, inseguita con dolcezza: { lon, lat }
  let dirFiltrata = null;      // direzione di marcia dopo il filtro passa-basso (gradi)
  let giroCamera = 0;
  let ultimoFotogramma = 0;
  let marginiCam = null;
  let contaFotogrammi = 0;
  let frecciaEl = null;
  let ripresa = 0;
  // dita sulla mappa (id -> istante del tocco). Con un dito appoggiato la camera sta ferma:
  // jumpTo interrompe i gesti in corso, e senza questa pausa non si riuscirebbe a trascinare la mappa.
  const toccando = new Map();
  const ditoSuMappa = () => {
    const ora = Date.now();
    toccando.forEach((t, id) => { if (ora - t > 20000) toccando.delete(id); });   // tocco perso: non blocca per sempre
    return toccando.size > 0;
  };

  // segnaposto: lo sostituisce il motore della navigazione
  function posizioneGuidata() { return io; }

  const corto = (a, b) => ((a - b) % 360 + 540) % 360 - 180;   // differenza a - b, dalla parte corta
  const dolce = (dt, tau) => 1 - Math.exp(-dt / tau);

  // La freccia sta sullo schermo: gira di (direzione - rotazione della mappa), calcolato a ogni fotogramma.
  function orientaFreccia() {
    if (!frecciaEl || !frecciaEl.isConnected) frecciaEl = document.getElementById('freccia-io');
    if (!frecciaEl || dirFiltrata == null || !map) return;
    const bear = cam && seguendo ? cam.bear : map.getBearing();
    frecciaEl.style.transform = 'rotate(' + corto(dirFiltrata, bear).toFixed(1) + 'deg)';
  }

  function passoCamera(t) {
    giroCamera = 0;
    if (!navigando || !map || !io) return;
    giroCamera = requestAnimationFrame(passoCamera);
    const dt = ultimoFotogramma ? Math.min(0.1, Math.max(0.001, (t - ultimoFotogramma) / 1000)) : 0.016;
    ultimoFotogramma = t;
    contaFotogrammi++;

    // posizione mostrata: insegue quella voluta; se è lontana (schermo spento a lungo) ci va subito
    const p = posizioneGuidata() || io;
    if (!visto || metri(visto.lat, visto.lon, p.lat, p.lon) > 120) visto = { lon: p.lon, lat: p.lat };
    else {
      const k = dolce(dt, 0.7);
      visto.lon += (p.lon - visto.lon) * k;
      visto.lat += (p.lat - visto.lat) * k;
    }

    // direzione di marcia: filtro passa-basso, sempre dalla parte corta
    const dir = direzioneMarcia();
    if (dir != null) {
      if (dirFiltrata == null) dirFiltrata = dir;
      else dirFiltrata += corto(dir, dirFiltrata) * dolce(dt, 0.35);
    }

    if (segnoIo) segnoIo.setLngLat([visto.lon, visto.lat]);

    if (seguendo && cam && !ditoSuMappa()) {
      if (contaFotogrammi % 20 === 0) marginiCam = marginiGuida();
      // la mappa gira solo se la direzione si discosta più di 8 gradi, e finché non è allineata (zona morta)
      if (dirFiltrata != null) {
        const d = corto(dirFiltrata, cam.bear);
        if (cam.giro ? Math.abs(d) < 1.5 : Math.abs(d) > 8) cam.giro = !cam.giro;
        if (cam.giro) cam.bear += d * dolce(dt, 0.6);
      }
      cam.zoom += (ZOOM_CAMMINO - cam.zoom) * dolce(dt, 0.6);
      cam.pitch += (INCLINAZIONE - cam.pitch) * dolce(dt, 0.6);
      cam.top += (marginiCam.top - cam.top) * dolce(dt, 0.4);
      cam.bottom += (marginiCam.bottom - cam.bottom) * dolce(dt, 0.4);
      // allo spunto (o alla ripresa) la mappa parte da dove si trova e si avvicina a te
      const ks = dolce(dt, 0.5);
      cam.scLon -= cam.scLon * ks;
      cam.scLat -= cam.scLat * ks;
      if (Math.abs(cam.scLon) < 1e-8 && Math.abs(cam.scLat) < 1e-8) cam.scLon = cam.scLat = 0;
      map.jumpTo({
        center: [visto.lon + cam.scLon, visto.lat + cam.scLat],
        zoom: cam.zoom, bearing: cam.bear, pitch: cam.pitch,
        padding: { top: cam.top, bottom: cam.bottom, left: 0, right: 0 }
      }, { camera: true });
    }
    orientaFreccia();
  }
  function avviaCamera() {
    if (!giroCamera && navigando) { ultimoFotogramma = 0; giroCamera = requestAnimationFrame(passoCamera); }
  }
  function fermaCamera() {
    if (giroCamera) cancelAnimationFrame(giroCamera);
    giroCamera = 0;
    cam = null; visto = null; dirFiltrata = null; marginiCam = null; frecciaEl = null;
  }

  // Parte (o riparte) dalla vista attuale della mappa; a ogni lettura del GPS basta richiamarla con false.
  function seguiMappa(primo) {
    if (!map || !io || !navigando) return;
    marginiCam = marginiGuida();
    if (seguendo) {
      inquadrata = false;
      if (primo || !cam) {
        const p = posizioneGuidata() || io, c = map.getCenter(), pd = map.getPadding();
        if (!visto) visto = { lon: p.lon, lat: p.lat };
        cam = {
          bear: map.getBearing(), pitch: map.getPitch(), zoom: map.getZoom(),
          top: pd.top, bottom: pd.bottom,
          scLon: c.lng - visto.lon, scLat: c.lat - visto.lat, giro: false
        };
      }
    }
    avviaCamera();
  }

  // Un gesto sulla mappa mette in pausa il seguire; dopo PAUSA_SEGUI senza tocchi riprende da solo.
  function smettiDiSeguire() {
    if (!seguendo) return;
    seguendo = false;
    cam = null;
    aggiornaPulsantiVai(riferimento().mio);
  }
  function pausaSegui() {
    if (!navigando) return;
    smettiDiSeguire();
    armaRipresa();
  }
  function armaRipresa() {
    clearTimeout(ripresa);
    ripresa = setTimeout(tentaRipresa, PAUSA_SEGUI);
  }
  function tentaRipresa() {
    ripresa = 0;
    if (!navigando || seguendo) return;
    // dito ancora sulla mappa, o movimento d'inerzia in corso: si aspetta
    if (ditoSuMappa() || (map && map.isMoving())) { armaRipresa(); return; }
    ritornaASeguire();
  }
  function ritornaASeguire() {
    clearTimeout(ripresa);
    ripresa = 0;
    seguendo = true;
    aggiornaPulsantiVai(riferimento().mio);
    seguiMappa(true);
  }
  function toccoInizio(e) { toccando.set(e.pointerId, Date.now()); if (!seguendo) armaRipresa(); }
  function toccoFine(e) { toccando.delete(e.pointerId); if (!seguendo) armaRipresa(); }
  function rotellaMappa() { if (!seguendo) armaRipresa(); }
  function agganciaGesti() {
    const c = map && map.getCanvasContainer();
    if (!c) return;
    c.addEventListener('pointerdown', toccoInizio, true);
    c.addEventListener('wheel', rotellaMappa, { passive: true });
    window.addEventListener('pointerup', toccoFine, true);
    window.addEventListener('pointercancel', toccoFine, true);
  }
  function sganciaGesti() {
    const c = map && map.getCanvasContainer();
    if (c) {
      c.removeEventListener('pointerdown', toccoInizio, true);
      c.removeEventListener('wheel', rotellaMappa, { passive: true });
    }
    window.removeEventListener('pointerup', toccoFine, true);
    window.removeEventListener('pointercancel', toccoFine, true);
    toccando.clear();
    clearTimeout(ripresa);
    ripresa = 0;
  }

  function iniziaNavigazione() {
    const i = mostrata();
    if (i == null || !riferimento().mio || navigando) return;
    chiediBussola();
    meta = i;
    fissata = i;
    navigando = true;
    seguendo = true;
    arrivoFatto = false;
    guida = null; prog = null; luoghiVia = []; passoDetto = -1; passoVibrato = -1;
    nascondiArrivo();
    chiudiLuogo();
    document.body.classList.add('naviga');
    stileVia(true);
    $('guida').hidden = false;
    $('btn-voce').setAttribute('aria-pressed', String(voce));
    if (map) map.setMaxPitch(60);
    imposta('mini', true);
    tieniSchermoAcceso();
    vibra(30);
    mostra();
    agganciaGesti();
    seguiMappa(true);
    chiediGuida();
    caricaLuoghi();
    parla('Si parte. ' + (stradaDi(i) ? 'Destinazione ' + stradaDi(i) + '.' : ''));
  }
  function finisciNavigazione() {
    if (!navigando) return;
    navigando = false;
    seguendo = false;
    meta = null;
    guida = null; prog = null; luoghiVia = [];
    togliSegniLuoghi();
    chiudiLuogo();
    clearTimeout(attesaArrivo);
    nascondiArrivo();
    lasciaSchermo();
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* niente */ }
    document.body.classList.remove('naviga');
    sganciaGesti();
    fermaCamera();
    if (segnoIo && io) segnoIo.setLngLat([io.lon, io.lat]);
    stileVia(false);
    $('guida').hidden = true;
    imposta('media');
    if (map) {
      map.easeTo({ pitch: 0, bearing: 0, padding: margini(), duration: 900 });
      map.once('moveend', () => { if (!navigando) { map.setMaxPitch(0); inquadra(); } });
    }
    applicaMargini();
    if (punti.length) mostra();
  }
  $('btn-voce').addEventListener('click', () => {
    voce = !voce;
    try { localStorage.setItem(CHIAVE_VOCE, voce ? '1' : '0'); } catch (e) { /* niente */ }
    $('btn-voce').setAttribute('aria-pressed', String(voce));
    if (voce) parla(navigando && guida ? $('guida-frase').textContent : 'Indicazioni a voce attive');
    else try { speechSynthesis.cancel(); } catch (e) { /* niente */ }
  });

  function nascondiArrivo() { $('arrivo').hidden = true; }
  function arrivo(tipo) {
    arrivoFatto = true;
    $('arrivo-figura').innerHTML = figura(tipo);
    $('arrivo-titolo').textContent = 'Sei arrivato';
    $('arrivo-testo').textContent = 'Buona bevuta!';
    $('arrivo').hidden = false;
    vibra([80, 60, 80]);
    parla('Sei arrivato. Buona bevuta!');
    clearTimeout(attesaArrivo);
    attesaArrivo = setTimeout(finisciNavigazione, 6000);
  }
  $('arrivo').addEventListener('click', finisciNavigazione);
  $('btn-vai').addEventListener('click', () => { if (navigando) finisciNavigazione(); else iniziaNavigazione(); });
  $('mini-azione').addEventListener('click', () => { if (navigando) finisciNavigazione(); else iniziaNavigazione(); });

  // ---------- Freccia della barra compatta ----------
  // Punta verso la fontanella: con la bussola ruota mentre giri il telefono,
  // senza bussola è riferita alla mappa (nord in alto).
  let rottaVerso = null, miniTesto = '', puntaAttuale = 0;
  function aggiornaFreccia() {
    if (rottaVerso == null) return;
    const conBussola = rotta != null;
    const verso = rottaVerso - (conBussola ? rotta : (map ? map.getBearing() : 0));
    // Si gira sempre dalla parte più corta, senza fare il giro completo a 0/360.
    const diff = ((verso - puntaAttuale) % 360 + 540) % 360 - 180;
    puntaAttuale += diff;
    $('freccia').style.setProperty('--punta', puntaAttuale.toFixed(1) + 'deg');
    const scarto = Math.abs(((verso % 360) + 540) % 360 - 180);
    const davanti = conBussola && riferimento().mio && scarto < 20 && miniTesto !== 'Ci sei';
    $('freccia').classList.toggle('davanti', davanti);
    const testo = davanti ? 'Dritta davanti a te' : miniTesto;
    const el = $('mini-dettaglio');
    if (el.textContent !== testo) el.textContent = testo;
    el.classList.toggle('davanti', davanti);
  }

  // ---------- Scheda trascinabile: tre posizioni ----------
  // mini: solo la barra compatta; media: distanza e pulsante; aperta: tutti i dettagli.
  function nascosto() { return largo.matches ? 0 : Math.max(0, $('scheda').offsetHeight - peek); }
  function altezzaMini() { return $('compatta').offsetTop + $('compatta').offsetHeight; }
  function giuMini() { return Math.max(nascosto(), $('scheda').offsetHeight - altezzaMini()); }
  function giuDi(st) {
    if (largo.matches || st === 'aperta') return 0;
    return st === 'mini' ? giuMini() : nascosto();
  }
  function visibile() { return stato === 'mini' && !largo.matches ? altezzaMini() : peek; }

  function misuraScheda() {
    const nuovo = $('cima').offsetTop + $('cima').offsetHeight;
    const cambiato = Math.abs(nuovo - peek) > 1;
    peek = nuovo;
    $('scheda').style.setProperty('--giu', giuDi(stato) + 'px');
    if (cambiato) applicaMargini();
  }
  function imposta(st, conVibrazione) {
    if (largo.matches) st = st === 'mini' ? 'media' : st;
    const prima = stato;
    stato = st;
    aperta = st === 'aperta';
    const scheda = $('scheda');
    scheda.classList.toggle('aperta', aperta);
    scheda.classList.toggle('ridotta', st === 'mini');
    scheda.style.setProperty('--giu', giuDi(st) + 'px');
    scheda.style.setProperty('--ridu', st === 'mini' ? '1' : '0');
    $('compatta').inert = st !== 'mini';
    $('cima').inert = st === 'mini';
    $('maniglia').setAttribute('aria-expanded', String(aperta));
    $('maniglia').setAttribute('aria-label', st === 'mini' ? 'Mostra la fontanella' : 'Apri o chiudi i dettagli');
    if (!aperta) $('resto').scrollTop = 0;
    if (prima !== st) {
      applicaMargini();
      if (conVibrazione && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* niente */ } }
    }
  }
  function apri(si) { imposta(si ? 'aperta' : 'media'); }

  (function trascinamento() {
    const scheda = $('scheda');
    let y0 = 0, base = 0, attuale = 0, attivo = false, mosso = false, tUltimo = 0, yUltimo = 0, vel = 0;
    function giu(e) {
      if (largo.matches || (e.target.closest && e.target.closest('a'))) return;
      attivo = true; mosso = false;
      y0 = yUltimo = e.clientY; tUltimo = e.timeStamp; vel = 0;
      base = attuale = giuDi(stato);
    }
    function muovi(e) {
      if (!attivo) return;
      const dy = e.clientY - y0;
      if (!mosso && Math.abs(dy) < 6) return;
      if (!mosso) { mosso = true; scheda.classList.add('trascina'); }
      const max = giuMini(), media = nascosto();
      attuale = base + dy;
      // oltre i limiti la scheda oppone resistenza
      if (attuale < 0) attuale = attuale / 3;
      if (attuale > max) attuale = max + (attuale - max) / 3;
      scheda.style.setProperty('--giu', attuale + 'px');
      // la barra compatta compare mentre la scheda scende sotto la posizione media
      const ridu = max > media ? Math.min(1, Math.max(0, (attuale - media) / (max - media))) : 0;
      scheda.style.setProperty('--ridu', ridu.toFixed(3));
      const dt = e.timeStamp - tUltimo;
      if (dt > 0) vel = (e.clientY - yUltimo) / dt;
      tUltimo = e.timeStamp; yUltimo = e.clientY;
      e.preventDefault();
    }
    function su() {
      if (!attivo) return;
      attivo = false;
      if (!mosso) return;
      scheda.classList.remove('trascina');
      const tappe = [['aperta', 0], ['media', nascosto()], ['mini', giuMini()]];
      let scelta;
      if (Math.abs(vel) > 0.35) {
        // un colpo veloce porta alla tappa successiva nella direzione del gesto
        const avanti = tappe.filter((t) => (vel > 0 ? t[1] > attuale + 4 : t[1] < attuale - 4));
        scelta = avanti.length ? (vel > 0 ? avanti[0] : avanti[avanti.length - 1]) : null;
      }
      if (!scelta) scelta = tappe.reduce((m, t) => (Math.abs(t[1] - attuale) < Math.abs(m[1] - attuale) ? t : m));
      imposta(scelta[0], true);
      // il clic che segue un trascinamento non deve attivare nulla
      const blocca = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', blocca, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', blocca, true), 60);
    }
    [$('maniglia'), $('cima'), $('compatta')].forEach((z) => z.addEventListener('pointerdown', giu));
    window.addEventListener('pointermove', muovi, { passive: false });
    window.addEventListener('pointerup', su);
    window.addEventListener('pointercancel', su);
    $('maniglia').addEventListener('click', () => imposta(stato === 'media' ? 'aperta' : 'media'));
    $('compatta').addEventListener('click', (e) => { if (!e.target.closest('a, button')) imposta('media'); });
  })();

  if ('ResizeObserver' in window) new ResizeObserver(misuraScheda).observe($('cima'));
  window.addEventListener('resize', () => { misuraScheda(); applicaMargini(); });
  largo.addEventListener('change', () => { misuraScheda(); applicaMargini(); });

  // ---------- Inquadrature ----------
  let ultimaInquadra = '';
  function chiaveInquadra() {
    const i = mostrata();
    return i + (i != null && percorsoValido(i, riferimento()) ? 'p' : '');
  }
  function inquadra() {
    const i = mostrata();
    if (!map || i == null) return;
    const p = punti[i];
    inquadrata = true;
    ultimaInquadra = chiaveInquadra();
    if (io && !ioLontano && metri(io.lat, io.lon, p[0], p[1]) < 4000) {
      const b = new maplibregl.LngLatBounds([io.lon, io.lat], [io.lon, io.lat]).extend([p[1], p[0]]);
      (lineaVia() || []).forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: { top: 90, bottom: 70, left: 60, right: 76 }, maxZoom: 17, duration: 1100, essential: true });
    } else {
      map.easeTo({ center: [p[1], p[0]], zoom: Math.max(map.getZoom(), 15.5), duration: 900, essential: true });
    }
  }

  // ---------- Condivisione ----------
  function linkFontanella(i) {
    return location.origin + location.pathname + '?f=' + punti[i][0].toFixed(5) + ',' + punti[i][1].toFixed(5);
  }
  async function copiaTesto(testo) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(testo);
        return true;
      }
    } catch (e) { /* si prova il metodo vecchio */ }
    try {
      const t = document.createElement('textarea');
      t.value = testo;
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch (e) { return false; }
  }
  async function condividi() {
    const i = mostrata();
    if (i == null) return;
    const p = punti[i], url = linkFontanella(i);
    const testo = 'Acqua fresca qui: ' + (p[3] || strade.get(i) || TIPI[p[2]].nome);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Sete', text: testo, url: url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;   // hai chiuso il foglio di condivisione
      }
    }
    avviso(await copiaTesto(url) ? 'Link copiato' : 'Non riesco a copiare il link');
  }
  $('btn-condividi').addEventListener('click', condividi);

  // Apertura da un link condiviso: ?f=lat,lon
  let datiLink = null;
  let linkDaTogliere = false;
  try {
    const par = new URLSearchParams(location.search);
    linkDaTogliere = par.has('f');
    const m = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(par.get('f') || '');
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) datiLink = { lat: +m[1], lon: +m[2] };
  } catch (e) { /* link non valido: si ignora */ }
  function apriDaLink() {
    if (!linkDaTogliere || !punti.length || !map) return;
    linkDaTogliere = false;
    // il parametro si toglie subito: un ricaricamento non deve ripetere la scelta
    try {
      const url = new URL(location.href);
      url.searchParams.delete('f');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (e) { /* niente */ }
    const l = datiLink;
    datiLink = null;
    if (!l) return;
    let migliore = null, min = RAGGIO_LINK;
    for (let i = 0; i < punti.length; i++) {
      const d = metri(l.lat, l.lon, punti[i][0], punti[i][1]);
      if (d <= min) { min = d; migliore = i; }
    }
    primaVista = false;
    if (migliore != null) {
      if (!passa(migliore)) {
        filtro = 't';
        segnaFiltri();
        ridisegnaPunti();
      }
      scegli(migliore);
    } else {
      inquadrata = false;
      map.easeTo({ center: [l.lon, l.lat], zoom: 16.5, duration: 900, essential: true });
    }
  }

  // ---------- Posizione ----------
  function disegnaIo() {
    if (!map || !io) return;
    if (!segnoIo) {
      const el = document.createElement('div');
      el.className = 'io';
      // Il cono mostra dove punta il telefono, come in Google Maps.
      el.innerHTML = '<div class="onda"></div>' +
        '<div class="cono" id="cono"><svg viewBox="-76 -76 152 152" aria-hidden="true"><defs>' +
        '<radialGradient id="cono-sfuma" cx="0" cy="0" r="74" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0.12" stop-color="#d9a93f" stop-opacity=".95"/>' +
        '<stop offset="0.55" stop-color="#d9a93f" stop-opacity=".5"/>' +
        '<stop offset="1" stop-color="#d9a93f" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="cono-bordo" x1="0" y1="0" x2="0" y2="-74" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" stop-color="#c2932d" stop-opacity=".9"/>' +
        '<stop offset="1" stop-color="#c2932d" stop-opacity="0"/></linearGradient></defs>' +
        '<path id="cono-spicchio" fill="url(#cono-sfuma)"/>' +
        '<path id="cono-lati" fill="none" stroke="url(#cono-bordo)" stroke-width="1.4" stroke-linejoin="round"/>' +
        '</svg></div><div class="punto"></div>' +
        // in navigazione il punto diventa una freccia che indica dove stai andando
        '<div class="freccia-io" id="freccia-io"><svg viewBox="0 0 64 64" aria-hidden="true">' +
        '<circle cx="32" cy="32" r="30" fill="#1c8fd0" fill-opacity=".16"/>' +
        '<path d="M32 9 47 51 32 42 17 51Z" transform="translate(0 2.5)" fill="#1f2927" fill-opacity=".14" stroke="#1f2927" stroke-opacity=".14" stroke-width="9" stroke-linejoin="round"/>' +
        '<path d="M32 9 47 51 32 42 17 51Z" transform="translate(0 1.5)" fill="#1f2927" fill-opacity=".22" stroke="#1f2927" stroke-opacity=".22" stroke-width="6.5" stroke-linejoin="round"/>' +
        '<path d="M32 9 47 51 32 42 17 51Z" fill="#d9a93f" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/>' +
        '<path d="M32 17.5 40.5 41.5 32 36.5Z" fill="#fff" fill-opacity=".38"/></svg></div>';
      // il segno sta sullo schermo (non steso sulla mappa): in navigazione la freccia la ruota il ciclo della camera
      segnoIo = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([io.lon, io.lat]).addTo(map);
      disegnaCono();
    } else if (!navigando) segnoIo.setLngLat([io.lon, io.lat]);
  }

  // ---------- Direzione (bussola) ----------
  let rotta = null;          // gradi da nord, già filtrati
  let rottaGrezza = null;    // ultimo valore letto
  let ampiezza = 44;         // apertura del cono in gradi: più larga se la bussola è incerta
  let ultimaBussola = 0;
  let giroCono = 0;

  function angoloSchermo() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }
  function nuovaRotta(gradi, incertezza) {
    if (gradi == null || isNaN(gradi)) return;
    rottaGrezza = ((gradi % 360) + 360) % 360;
    if (incertezza != null && incertezza >= 0) ampiezza = Math.min(100, Math.max(38, incertezza * 2));
    if (!giroCono) giroCono = requestAnimationFrame(passoCono);
  }
  // Ammorbidisce i salti della bussola, passando sempre dalla parte più corta.
  function passoCono() {
    giroCono = 0;
    if (rottaGrezza == null) return;
    if (rotta == null) rotta = rottaGrezza;
    else {
      const diff = ((rottaGrezza - rotta + 540) % 360) - 180;
      if (Math.abs(diff) < 0.3) rotta = rottaGrezza;
      else { rotta = (rotta + diff * 0.25 + 360) % 360; giroCono = requestAnimationFrame(passoCono); }
    }
    disegnaCono();
  }
  function disegnaCono() {
    const cono = document.getElementById('cono');
    if (!cono) return;
    if (rotta == null) { cono.classList.remove('vista'); return; }
    const mezzo = ampiezza / 2 * RAD, r = 72;
    const x = (r * Math.sin(mezzo)).toFixed(1), y = (-r * Math.cos(mezzo)).toFixed(1);
    document.getElementById('cono-spicchio').setAttribute('d',
      'M0 0L' + (-x) + ' ' + y + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + y + 'Z');
    document.getElementById('cono-lati').setAttribute('d', 'M' + (-x) + ' ' + y + 'L0 0L' + x + ' ' + y);
    // il segno sta sullo schermo: il cono si orienta rispetto al nord della mappa
    const giro = rotta - (map ? map.getBearing() : 0);
    cono.style.transform = 'rotate(' + giro.toFixed(1) + 'deg)';
    cono.classList.add('vista');
    aggiornaFreccia();
  }

  function letturaBussola(e) {
    let gradi = null, incertezza = null;
    if (typeof e.webkitCompassHeading === 'number') {
      // iPhone: già riferita al nord, va solo corretta per lo schermo ruotato.
      gradi = e.webkitCompassHeading + angoloSchermo();
      if (typeof e.webkitCompassAccuracy === 'number' && e.webkitCompassAccuracy >= 0) incertezza = e.webkitCompassAccuracy;
    } else if ((e.absolute || e.type === 'deviceorientationabsolute') && typeof e.alpha === 'number') {
      // Android: alpha cresce in senso antiorario, la rotta in senso orario.
      gradi = 360 - e.alpha + angoloSchermo();
    }
    if (gradi == null) return;
    ultimaBussola = Date.now();
    nuovaRotta(gradi, incertezza);
  }

  // Si ascolta subito: dove serve un permesso (iPhone) le letture arrivano solo dopo averlo concesso.
  if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', letturaBussola);
  else if ('DeviceOrientationEvent' in window) window.addEventListener('deviceorientation', letturaBussola);

  // Sull'iPhone la bussola va chiesta dopo un tocco dell'utente.
  let bussolaChiesta = false;
  function chiediBussola() {
    if (bussolaChiesta || ultimaBussola || !window.DeviceOrientationEvent) return;
    const chiedi = window.DeviceOrientationEvent.requestPermission;
    if (typeof chiedi !== 'function') return;
    bussolaChiesta = true;
    chiedi.call(window.DeviceOrientationEvent).catch(() => { bussolaChiesta = false; });
  }
  document.addEventListener('click', chiediBussola, { capture: true });
  function posizioneTrovata(pos) {
    const c = pos.coords;
    const incerto = (a) => a > GPS_INCERTO;
    const mosso = !io || metri(io.lat, io.lon, c.latitude, c.longitude) > 4 || incerto(io.acc) !== incerto(c.accuracy);
    io = { lat: c.latitude, lon: c.longitude, acc: c.accuracy || 0 };
    gpsNegato = false;
    // Senza bussola, mentre cammini la direzione la dà il GPS.
    if (Date.now() - ultimaBussola > 3000 && c.heading != null && !isNaN(c.heading) && c.speed > 0.7) nuovaRotta(c.heading, 25);
    $('btn-centra').classList.add('attivo');
    disegnaIo();
    // in navigazione la camera si aggiorna a ogni lettura, anche se ti sei mosso poco
    if (navigando && map) seguiMappa(false);
    if (!punti.length || !map || !mosso) return;
    ioLontano = false;
    calcola();
    ioLontano = !!vicine[0] && vicine[0].d > LONTANO_DA_ROMA;
    if (ioLontano) calcola();
    mostra();
    if (!navigando && primaVista && !ioLontano) { primaVista = false; inquadra(); }
  }
  function posizioneNegata(err) {
    if (err && err.code === 1) gpsNegato = true;
    if (!io) $('btn-centra').classList.remove('attivo');
    if (punti.length && map) mostra();
  }
  let osservatore = null;
  function seguiPosizione() {
    if (!('geolocation' in navigator)) { gpsNegato = true; return; }
    if (osservatore != null) navigator.geolocation.clearWatch(osservatore);
    osservatore = navigator.geolocation.watchPosition(posizioneTrovata, posizioneNegata, {
      enableHighAccuracy: true, maximumAge: 5000, timeout: 20000
    });
  }

  // ---------- Comandi ----------
  $('btn-piu').addEventListener('click', () => { inquadrata = false; if (navigando) pausaSegui(); if (map) map.zoomIn({ duration: 350 }); });
  $('btn-meno').addEventListener('click', () => { inquadrata = false; if (navigando) pausaSegui(); if (map) map.zoomOut({ duration: 350 }); });
  $('btn-centra').addEventListener('click', () => {
    if (!map) return;
    chiediBussola();
    if (navigando) ritornaASeguire();
    else if (io && !ioLontano) { fissata = null; aggiorna(); inquadra(); }
    else if (io && ioLontano) map.flyTo({ center: ROMA, zoom: 15.4, duration: 1200 });
    else { primaVista = true; seguiPosizione(); }
  });
  $('btn-sblocca').addEventListener('click', () => { if (navigando) return; fissata = null; aggiorna(); inquadra(); });

  function segnaFiltri() {
    document.querySelectorAll('.filtro').forEach((f) => {
      const attivo = f.dataset.t === filtro;
      f.classList.toggle('attivo', attivo);
      f.setAttribute('aria-pressed', String(attivo));
    });
  }
  // L'ultimo filtro scelto resta attivo alla prossima apertura.
  try {
    const salvato = localStorage.getItem(CHIAVE_FILTRO);
    if (salvato === 'n' || salvato === 'f' || salvato === 'm') { filtro = salvato; segnaFiltri(); }
  } catch (err) { /* niente */ }

  $('filtri').addEventListener('click', (e) => {
    const b = e.target.closest('.filtro');
    if (!b || !punti.length) return;
    // Toccare di nuovo il filtro attivo torna a mostrarle tutte.
    filtro = filtro === b.dataset.t ? 't' : b.dataset.t;
    try { localStorage.setItem(CHIAVE_FILTRO, filtro); } catch (err) { /* niente */ }
    segnaFiltri();
    if (!navigando && fissata != null && !passa(fissata)) fissata = null;
    ridisegnaPunti();
    aggiorna();
    if (fissata == null && riferimento().mio) inquadra();
  });

  function testoDati() {
    if (!punti.length) return 'Nessun dato scaricato.';
    const data = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(quando));
    const conta = (t) => punti.filter((p) => p[2] === t).length.toLocaleString('it-IT');
    return punti.length.toLocaleString('it-IT') + ' punti d\u2019acqua: ' + conta('n') + ' nasoni, ' + conta('f') +
      ' fontanelle, ' + conta('m') + ' fontane. Scaricati il ' + data + '.';
  }
  function testoBussola() {
    if (ultimaBussola && Date.now() - ultimaBussola < 5000) return 'Bussola: attiva, il fascio dorato mostra dove punti il telefono.';
    if (rotta != null) return 'Bussola: non disponibile, la direzione arriva dal GPS mentre cammini.';
    if (!window.DeviceOrientationEvent) return 'Bussola: questo browser non la supporta.';
    if (bussolaChiesta) return 'Bussola: nessuna lettura. Controlla che il browser abbia il permesso per movimento e orientamento.';
    return 'Bussola: nessuna lettura dal telefono.';
  }
  function testoNascoste() {
    const n = nascoste.size;
    $('info-nascoste').hidden = n === 0;
    if (!n) return;
    $('info-nascoste-testo').textContent = n === 1
      ? 'Hai nascosto 1 fontanella su questo telefono.'
      : 'Hai nascosto ' + n.toLocaleString('it-IT') + ' fontanelle su questo telefono.';
    $('btn-mostra-nascoste').textContent = n === 1
      ? 'Mostra di nuovo la fontanella nascosta'
      : 'Mostra di nuovo le ' + n.toLocaleString('it-IT') + ' fontanelle nascoste';
  }
  $('btn-mostra-nascoste').addEventListener('click', () => {
    nascoste.clear();
    salvaNascoste();
    rinfrescaTutto();
    testoNascoste();
  });

  // ---------- "Non funziona" ----------
  let daSegnalare = null;    // chiave "lat,lon" della fontanella di cui si parla
  $('btn-nonfunziona').addEventListener('click', () => {
    const i = mostrata();
    if (i == null) return;
    const p = punti[i], tipo = TIPI[p[2]];
    daSegnalare = chiave(i);
    $('nf-nome').textContent = (p[3] || strade.get(i) || tipo.nome) + (p[3] || strade.get(i) ? ' (' + tipo.nome.toLowerCase() + ')' : '');
    $('btn-osm').href = 'https://www.openstreetmap.org/note/new#map=19/' + p[0].toFixed(5) + '/' + p[1].toFixed(5);
    $('nonfunziona').showModal();
  });
  $('btn-nascondi').addEventListener('click', () => {
    $('nonfunziona').close();
    if (daSegnalare) nascondi(daSegnalare);
    daSegnalare = null;
  });
  $('btn-osm').addEventListener('click', () => { setTimeout(() => $('nonfunziona').close(), 0); });
  $('nonfunziona').addEventListener('click', (e) => { if (e.target === $('nonfunziona')) $('nonfunziona').close(); });

  $('btn-info').addEventListener('click', () => {
    testoNascoste();
    $('info-dati').textContent = testoDati();
    $('info-bussola').textContent = testoBussola();
    $('info').showModal();
  });
  $('info').addEventListener('click', (e) => { if (e.target === $('info')) $('info').close(); });
  $('btn-aggiorna').addEventListener('click', async () => {
    const b = $('btn-aggiorna');
    b.disabled = true;
    b.textContent = 'Scarico\u2026';
    try {
      await scarica();
      finisciNavigazione();
      fissata = null; ultimaMostrata = null; sceltoIndice = null;
      if (segnoScelto) { segnoScelto.remove(); segnoScelto = null; }
      strade.clear();
      ridisegnaPunti();
      aggiorna();
      $('info-dati').textContent = testoDati();
      b.textContent = 'Fontanelle aggiornate';
    } catch (e) {
      b.textContent = 'Non riesco a scaricare. Riprova';
    }
    b.disabled = false;
  });

  // ---------- Avvio ----------
  function pronti() {
    disegnaIo();
    if (mappaPronta) map.getSource('fontanelle').setData(geojson());
    if (io) {
      ioLontano = false;
      calcola();
      ioLontano = !!vicine[0] && vicine[0].d > LONTANO_DA_ROMA;
    }
    aggiorna();
    aggiornaSegni();
    $('sipario').classList.add('via');
    if (io && !ioLontano && primaVista) { primaVista = false; setTimeout(inquadra, 350); }
    apriDaLink();
  }

  async function caricaDati() {
    $('btn-riprova').hidden = true;
    // Dati scaduti, oppure nel formato vecchio senza strade e servizi: si aggiornano in sottofondo.
    const vecchi = () => Date.now() - quando > GIORNI_VALIDITA * 864e5 || (punti[0] && punti[0].length < 6);
    if (leggiSalvati()) {
      if (vecchi() && navigator.onLine) {
        // Prima la copia pubblicata con l'app, poi, se serve ancora, OpenStreetMap.
        (async () => {
          const j = await leggiPacchetto();
          if (j && (j.quando > quando || punti[0].length < 6)) { usaPacchetto(j); strade.clear(); ridisegnaPunti(); aggiorna(); }
          if (vecchi()) await scarica().then(() => { ridisegnaPunti(); aggiorna(); }).catch(() => {});
        })();
      }
      return true;
    }
    $('sipario-testo').textContent = 'Preparo le fontanelle di Roma\u2026';
    const j = await leggiPacchetto();
    if (j) {
      usaPacchetto(j);
      if (vecchi() && navigator.onLine) scarica().then(() => { ridisegnaPunti(); aggiorna(); }).catch(() => {});
      return true;
    }
    $('sipario-testo').textContent = 'Scarico le fontanelle di Roma. Succede solo la prima volta, può volerci mezzo minuto.';
    try {
      await scarica();
      return true;
    } catch (e) {
      $('sipario-testo').textContent = navigator.onLine
        ? 'Non riesco a scaricare le fontanelle: il servizio di OpenStreetMap è occupato. Riprova tra qualche secondo.'
        : 'Sei offline. La prima volta serve una connessione per scaricare le fontanelle.';
      $('btn-riprova').hidden = false;
      return false;
    }
  }

  let mappaCreata = null;
  async function avvia() {
    if (!mappaCreata) mappaCreata = creaMappa();
    const [ok] = await Promise.all([caricaDati(), mappaCreata]);
    if (ok) pronti();
  }
  $('btn-riprova').addEventListener('click', avvia);

  seguiPosizione();
  avvia();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
