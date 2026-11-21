/* Sete: le fontanelle di Roma.
   Nessun server: i dati arrivano da OpenStreetMap e restano salvati sul telefono. */
(function () {
  'use strict';

  // ---------- Impostazioni (puoi cambiarle) ----------
  const ROMA = [12.4829, 41.8933];                 // longitudine, latitudine
  const RIQUADRO = '41.65,12.23,42.10,12.86';      // sud, ovest, nord, est
  const STILE_MAPPA = 'https://tiles.openfreemap.org/styles/liberty';
  const STILE_NOTTE = 'https://tiles.openfreemap.org/styles/dark';
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
  const CHIAVE_TEMA = 'sete.tema';
  const GPS_INCERTO = 80;        // metri: oltre, avvisa che la posizione è approssimativa

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
  let punti = [];            // [lat, lon, tipo, nome]
  let quando = 0;
  let filtro = 't';          // t = tutte, oppure n / f / m
  let io = null;             // {lat, lon}
  let ioLontano = false;
  let gpsNegato = false;
  let fissata = null;        // fontanella scelta a mano
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
  const strade = new Map();  // indice -> nome della strada

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
  const passa = (i) => filtro === 't' || punti[i][2] === filtro;

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
          nuovi.push([+lat.toFixed(5), +lon.toFixed(5), tipo, t.name || '']);
        }
        if (nuovi.length < 50) throw new Error('risposta troppo corta');
        punti = nuovi;
        quando = Date.now();
        try { localStorage.setItem(CHIAVE, JSON.stringify({ quando, punti })); } catch (e) { /* memoria piena */ }
        return;
      } catch (e) { ultimoErrore = e; }
    }
    throw ultimoErrore || new Error('nessun server');
  }

  // ---------- Indirizzi ----------
  let attesaStrada = null;
  function cercaStrada(i) {
    clearTimeout(attesaStrada);
    if (strade.has(i) || !navigator.onLine) return;
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

  // ---------- Mappa chiara di giorno, scura di sera ----------
  let notte = false;
  let temaScelto = 'auto';   // auto, chiaro o scuro
  try { temaScelto = localStorage.getItem(CHIAVE_TEMA) || 'auto'; } catch (e) { /* niente */ }

  // Alba e tramonto del giorno (formula astronomica semplificata, precisa a pochi minuti).
  function sole(quandoMs, lat, lon) {
    const J = quandoMs / 864e5 + 2440587.5;
    const n = Math.round(J - 2451545 + 0.0008);
    const Js = n - lon / 360;
    const M = (357.5291 + 0.98560028 * Js) % 360;
    const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
    const L = (M + C + 180 + 102.9372) % 360;
    const Jt = 2451545 + Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
    const decl = Math.asin(Math.sin(L * RAD) * Math.sin(23.4397 * RAD));
    const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
    const W = Math.acos(Math.max(-1, Math.min(1, cosW))) / RAD;
    const ms = (g) => (g - 2440587.5) * 864e5;
    return { alba: ms(Jt - W / 360), tramonto: ms(Jt + W / 360) };
  }
  function eNotte() {
    if (temaScelto === 'scuro') return true;
    if (temaScelto === 'chiaro') return false;
    const ora = Date.now(), lat = io ? io.lat : ROMA[1], lon = io ? io.lon : ROMA[0];
    const s = sole(ora, lat, lon), crepuscolo = 25 * 60e3;
    return ora < s.alba - crepuscolo || ora > s.tramonto + crepuscolo;
  }

  const stiliLetti = {};
  async function stileMappa(scuro) {
    const url = scuro ? STILE_NOTTE : STILE_MAPPA;
    try {
      if (!stiliLetti[url]) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error('stile');
        stiliLetti[url] = await r.json();
      }
      const stile = JSON.parse(JSON.stringify(stiliLetti[url]));
      // Via i simboli dei negozi e gli edifici in 3D: sulla mappa devono risaltare le fontanelle.
      const nascosti = ['poi_r20', 'poi_r7', 'poi_r1', 'building-3d'];
      stile.layers = stile.layers.filter((l) => nascosti.indexOf(l.id) === -1);
      return stile;
    } catch (e) {
      // se la mappa vettoriale non risponde si usa quella classica di OpenStreetMap, scurita di sera
      const raster = JSON.parse(JSON.stringify(RASTER));
      if (scuro) {
        raster.layers[0].paint['background-color'] = '#1b2321';
        raster.layers[1].paint = { 'raster-brightness-max': 0.55, 'raster-saturation': -0.5, 'raster-contrast': 0.1 };
      }
      return raster;
    }
  }

  function segnaTema() {
    document.documentElement.classList.toggle('notte', notte);
    document.querySelectorAll('.tema button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === temaScelto)));
  }
  let giroTema = 0;
  async function controllaTema() {
    const n = eNotte();
    if (n === notte) return;
    notte = n;
    segnaTema();
    if (!map) return;
    const mio = ++giroTema;
    const stile = await stileMappa(n);
    if (mio !== giroTema) return;
    mappaPronta = false;
    map.setStyle(stile, { diff: false });
    map.once('style.load', aggiungiStrati);
  }
  setInterval(controllaTema, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) controllaTema(); });

  function margini() {
    const alto = $('filtri').getBoundingClientRect().bottom;
    if (largo.matches) return { top: 20, bottom: 20, left: 420, right: 20 };
    return { top: Math.round(alto), bottom: Math.round(visibile()), left: 0, right: 0 };
  }
  let marginiInSospeso = false;
  let inquadrata = false;    // vero finché l'utente non sposta la mappa dopo un'inquadratura
  function applicaMargini() {
    const m = margini();
    document.documentElement.style.setProperty('--alto', m.top + 'px');
    document.documentElement.style.setProperty('--peek', (largo.matches ? 0 : visibile()) + 'px');
    if (!map) return;
    // Mai interrompere un movimento della mappa già in corso: si rimanda alla fine.
    if (map.isMoving()) { marginiInSospeso = true; return; }
    const p = map.getPadding();
    if (p.top !== m.top || p.bottom !== m.bottom || p.left !== m.left || p.right !== m.right) {
      // Se la mappa sta inquadrando te e la fontanella, si rifà l'inquadratura con i margini nuovi:
      // spostare solo i margini farebbe scivolare la fontanella sotto i filtri o sotto la scheda.
      if (inquadrata) { map.setPadding(m); inquadra(); }
      else map.easeTo({ padding: m, duration: 300 });
    }
  }

  async function creaMappa() {
    notte = eNotte();
    segnaTema();
    const style = await stileMappa(notte);
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

    map.on('rotate', disegnaCono);
    // un gesto dell'utente sulla mappa interrompe l'inquadratura automatica
    ['dragstart', 'zoomstart'].forEach((ev) => map.on(ev, (e) => { if (e.originalEvent) inquadrata = false; }));

    let freno = 0;
    map.on('move', () => {
      const ora = Date.now();
      if (ora - freno > 180) { freno = ora; aggiornaSegni(); }
    });
    map.on('moveend', () => {
      if (marginiInSospeso) { marginiInSospeso = false; applicaMargini(); }
      aggiornaSegni();
      if (!punti.length || riferimento().mio) return;
      calcola();
      mostra();
    });
  }

  // Linea del percorso e punti delle fontanelle, ridisegnati anche quando cambia lo stile.
  function aggiungiStrati() {
    if (map.getSource('fontanelle')) return;
    map.addSource('via', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'via-bordo', type: 'line', source: 'via',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': notte ? '#121917' : '#ffffff', 'line-width': 8, 'line-opacity': 0.85 }
    });
    map.addLayer({
      id: 'via', type: 'line', source: 'via',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': notte ? '#f1f3f0' : '#1f2927', 'line-width': 4.5, 'line-dasharray': [0.01, 2] }
    });
    map.addSource('fontanelle', { type: 'geojson', data: geojson() });
    map.addLayer({
      id: 'punti', type: 'circle', source: 'fontanelle',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.3, 12, 2.8, 14, 5, 15, 6.5],
        'circle-color': ['match', ['get', 't'], 'n', notte ? '#dfe6e3' : '#1f2927', 'm', '#c9972c', notte ? '#35b3e6' : '#0b84b5'],
        'circle-stroke-color': notte ? '#121917' : '#ffffff',
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
    const rt = percorsoValido(i, r);
    if (!rt) return { d: dritta, aPiedi: false };
    // mentre cammini si corregge con quanto ti sei avvicinato, senza richiedere il percorso a ogni passo
    return { d: Math.max(dritta, rt.d + dritta - rt.dritta), aPiedi: true };
  }
  let attesaRicalcolo = null;
  function chiediPercorsi(indici) {
    const r = riferimento();
    if (!r.mio || !navigator.onLine || percorsiFalliti >= 3) return;
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
    return fissata != null ? fissata : (vicine[0] ? vicine[0].i : null);
  }

  function scegli(i) {
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

  let ultimoValore = 0, ultimaUnita = 'm', ultimoTipo = null;
  function mostra() {
    const i = mostrata();
    if (i == null) {
      $('scheda').classList.add('nascosta');
      return;
    }
    const p = punti[i], r = riferimento(), tipo = TIPI[p[2]];
    const vera = distanzaVera(i, r), d = vera.d;
    if (r.mio) chiediPercorsi([i]);
    const rt = percorsi.get(i);
    const inLinea = r.mio && !vera.aPiedi && rt && rt.errore ? ' in linea d\u2019aria' : '';
    const dist = distanza(d);
    const cambiata = i !== ultimaMostrata;

    $('scheda').classList.remove('nascosta');
    $('mirino').hidden = r.mio;

    const arrivato = r.mio && d < 15;
    $('contesto').textContent = arrivato ? 'Ci sei, è qui accanto'
      : fissata != null ? 'Hai scelto'
      : (r.mio ? 'La più vicina a te' : 'La più vicina al centro');
    $('btn-sblocca').hidden = fissata == null;

    if (cambiata && dist.u === ultimaUnita && ultimaMostrata != null) animaNumero(ultimoValore, dist.v);
    else { giro++; $('dist-num').textContent = cifre(dist.v); }
    $('dist-unita').textContent = dist.u;
    ultimoValore = dist.v; ultimaUnita = dist.u;

    const strada = strade.get(i);
    $('titolo').textContent = p[3] || strada || tipo.nome;
    $('dettaglio').textContent = ((p[3] || strada) ? tipo.nome + ', ' : '') + minuti(d) + inLinea + ', verso ' + verso(r.lat, r.lon, p[0], p[1]);
    $('spiega').textContent = tipo.spiega;
    if (p[2] !== ultimoTipo) { $('figura').innerHTML = figura(p[2]); ultimoTipo = p[2]; }

    let nota = '';
    if (io && ioLontano) nota = 'Sei lontano da Roma. Sposta la mappa per esplorare una zona.';
    else if (gpsNegato) nota = 'Posizione non attiva. Sposta la mappa, oppure tocca la freccia a destra per riprovare.';
    else if (r.mio && io.acc > GPS_INCERTO) nota = 'Posizione approssimativa (circa ' + Math.round(io.acc / 10) * 10 + ' m): la più vicina potrebbe essere un\u2019altra. All\u2019aperto il GPS diventa più preciso.';
    $('nota').textContent = nota;
    $('nota').hidden = !nota;

    $('btn-vai').href = $('mini-vai').href = suApple
      ? 'https://maps.apple.com/?daddr=' + p[0] + ',' + p[1] + '&dirflg=w'
      : 'https://www.google.com/maps/dir/?api=1&destination=' + p[0] + ',' + p[1] + '&travelmode=walking';

    // Barra compatta
    $('mini-num').textContent = cifre(dist.v);
    $('mini-unita').textContent = dist.u;
    $('mini-titolo').textContent = $('titolo').textContent;
    miniTesto = arrivato ? 'Ci sei' : minuti(d);
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
      cosa.textContent = p[3] || strade.get(v.i) || tipo.nome;
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
    $('compatta').addEventListener('click', (e) => { if (!e.target.closest('a')) imposta('media'); });
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
        '</svg></div><div class="punto"></div>';
      segnoIo = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([io.lon, io.lat]).addTo(map);
      disegnaCono();
    } else segnoIo.setLngLat([io.lon, io.lat]);
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
    if (!punti.length || !map || !mosso) return;
    ioLontano = false;
    calcola();
    ioLontano = !!vicine[0] && vicine[0].d > LONTANO_DA_ROMA;
    if (ioLontano) calcola();
    mostra();
    if (primaVista && !ioLontano) { primaVista = false; inquadra(); }
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
  $('btn-piu').addEventListener('click', () => { inquadrata = false; if (map) map.zoomIn({ duration: 350 }); });
  $('btn-meno').addEventListener('click', () => { inquadrata = false; if (map) map.zoomOut({ duration: 350 }); });
  $('btn-centra').addEventListener('click', () => {
    if (!map) return;
    chiediBussola();
    if (io && !ioLontano) { fissata = null; aggiorna(); inquadra(); }
    else if (io && ioLontano) map.flyTo({ center: ROMA, zoom: 15.4, duration: 1200 });
    else { primaVista = true; seguiPosizione(); }
  });
  $('btn-sblocca').addEventListener('click', () => { fissata = null; aggiorna(); inquadra(); });

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
    if (fissata != null && !passa(fissata)) fissata = null;
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
  document.querySelectorAll('.tema button').forEach((b) => b.addEventListener('click', () => {
    temaScelto = b.dataset.tema;
    try { localStorage.setItem(CHIAVE_TEMA, temaScelto); } catch (e) { /* niente */ }
    segnaTema();
    controllaTema();
  }));

  $('btn-info').addEventListener('click', () => {
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
  }

  async function caricaDati() {
    $('btn-riprova').hidden = true;
    const vecchi = () => Date.now() - quando > GIORNI_VALIDITA * 864e5;
    if (leggiSalvati()) {
      if (vecchi() && navigator.onLine) {
        // Prima la copia pubblicata con l'app, poi, se serve ancora, OpenStreetMap.
        (async () => {
          const j = await leggiPacchetto();
          if (j && j.quando > quando) { usaPacchetto(j); strade.clear(); ridisegnaPunti(); aggiorna(); }
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
