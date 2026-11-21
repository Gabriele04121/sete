/* Sete: le fontanelle di Roma.
   Nessun server: i dati arrivano da OpenStreetMap e restano salvati sul telefono. */
(function () {
  'use strict';

  // ---------- Impostazioni (puoi cambiarle) ----------
  const ROMA = [12.4829, 41.8933];                 // longitudine, latitudine
  const RIQUADRO = '41.65,12.23,42.10,12.86';      // sud, ovest, nord, est
  const STILE_MAPPA = 'https://tiles.openfreemap.org/styles/liberty';
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
  function verso(aLat, aLon, bLat, bLon) {
    const y = Math.sin((bLon - aLon) * RAD) * Math.cos(bLat * RAD);
    const x = Math.cos(aLat * RAD) * Math.sin(bLat * RAD) -
      Math.sin(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((bLon - aLon) * RAD);
    const gradi = (Math.atan2(y, x) / RAD + 360) % 360;
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
    const alto = $('filtri').getBoundingClientRect().bottom;
    if (largo.matches) return { top: 20, bottom: 20, left: 420, right: 20 };
    return { top: Math.round(alto), bottom: Math.round(peek), left: 0, right: 0 };
  }
  let marginiInSospeso = false;
  function applicaMargini() {
    const m = margini();
    document.documentElement.style.setProperty('--alto', m.top + 'px');
    document.documentElement.style.setProperty('--peek', (largo.matches ? 0 : peek) + 'px');
    if (!map) return;
    // Mai interrompere un movimento della mappa già in corso: si rimanda alla fine.
    if (map.isMoving()) { marginiInSospeso = true; return; }
    const p = map.getPadding();
    if (p.top !== m.top || p.bottom !== m.bottom || p.left !== m.left || p.right !== m.right) {
      map.easeTo({ padding: m, duration: 300 });
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
    quandoPronta(() => {
      map.addSource('via', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'via-bordo', type: 'line', source: 'via',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 }
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
    });

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

  function aggiornaVia() {
    if (!mappaPronta) return;
    const i = mostrata(), r = riferimento();
    const dati = { type: 'FeatureCollection', features: [] };
    if (i != null && r.mio) {
      dati.features.push({
        type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: [[r.lon, r.lat], [punti[i][1], punti[i][0]]] }
      });
    }
    map.getSource('via').setData(dati);
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
    vicine = tutte.slice(0, 7);
  }
  function mostrata() {
    return fissata != null ? fissata : (vicine[0] ? vicine[0].i : null);
  }

  function scegli(i) {
    fissata = i;
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
    const d = metri(r.lat, r.lon, p[0], p[1]);
    const dist = distanza(d);
    const cambiata = i !== ultimaMostrata;

    $('scheda').classList.remove('nascosta');
    $('mirino').hidden = r.mio;

    $('contesto').textContent = fissata != null
      ? 'Hai scelto'
      : (r.mio ? 'La più vicina a te' : 'La più vicina al centro');
    $('btn-sblocca').hidden = fissata == null;

    if (cambiata && dist.u === ultimaUnita && ultimaMostrata != null) animaNumero(ultimoValore, dist.v);
    else { giro++; $('dist-num').textContent = cifre(dist.v); }
    $('dist-unita').textContent = dist.u;
    ultimoValore = dist.v; ultimaUnita = dist.u;

    const strada = strade.get(i);
    $('titolo').textContent = p[3] || strada || tipo.nome;
    $('dettaglio').textContent = ((p[3] || strada) ? tipo.nome + ', ' : '') + minuti(d) + ', verso ' + verso(r.lat, r.lon, p[0], p[1]);
    $('spiega').textContent = tipo.spiega;
    if (p[2] !== ultimoTipo) { $('figura').innerHTML = figura(p[2]); ultimoTipo = p[2]; }

    let nota = '';
    if (io && ioLontano) nota = 'Sei lontano da Roma. Sposta la mappa per esplorare una zona.';
    else if (gpsNegato) nota = 'Posizione non attiva. Sposta la mappa, oppure tocca la freccia a destra per riprovare.';
    $('nota').textContent = nota;
    $('nota').hidden = !nota;

    $('btn-vai').href = suApple
      ? 'https://maps.apple.com/?daddr=' + p[0] + ',' + p[1] + '&dirflg=w'
      : 'https://www.google.com/maps/dir/?api=1&destination=' + p[0] + ',' + p[1] + '&travelmode=walking';

    ultimaMostrata = i;
    segnaScelto(i);
    aggiornaVia();
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

  // ---------- Scheda trascinabile ----------
  function nascosto() { return largo.matches ? 0 : Math.max(0, $('scheda').offsetHeight - peek); }
  function misuraScheda() {
    const nuovo = $('cima').offsetTop + $('cima').offsetHeight;
    const cambiato = Math.abs(nuovo - peek) > 1;
    peek = nuovo;
    $('scheda').style.setProperty('--giu', (aperta ? 0 : nascosto()) + 'px');
    if (cambiato) applicaMargini();
  }
  function apri(si) {
    aperta = si;
    $('scheda').classList.toggle('aperta', si);
    $('maniglia').setAttribute('aria-expanded', String(si));
    $('scheda').style.setProperty('--giu', (si ? 0 : nascosto()) + 'px');
    if (!si) $('resto').scrollTop = 0;
  }

  (function trascinamento() {
    const scheda = $('scheda');
    let y0 = 0, base = 0, attuale = 0, attivo = false, mosso = false, tUltimo = 0, yUltimo = 0, vel = 0;
    function giu(e) {
      if (largo.matches || (e.target.closest && e.target.closest('a'))) return;
      attivo = true; mosso = false;
      y0 = yUltimo = e.clientY; tUltimo = e.timeStamp; vel = 0;
      base = aperta ? 0 : nascosto();
    }
    function muovi(e) {
      if (!attivo) return;
      const dy = e.clientY - y0;
      if (!mosso && Math.abs(dy) < 6) return;
      if (!mosso) { mosso = true; scheda.classList.add('trascina'); }
      const max = nascosto();
      attuale = Math.min(max + 30, Math.max(-20, base + dy));
      // oltre i limiti la scheda oppone resistenza
      if (attuale < 0) attuale = attuale / 3;
      if (attuale > max) attuale = max + (attuale - max) / 3;
      scheda.style.setProperty('--giu', attuale + 'px');
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
      const max = nascosto();
      apri(Math.abs(vel) > 0.35 ? vel < 0 : attuale < max / 2);
      // il clic che segue un trascinamento non deve attivare nulla
      const blocca = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', blocca, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', blocca, true), 60);
    }
    [$('maniglia'), $('cima')].forEach((z) => z.addEventListener('pointerdown', giu));
    window.addEventListener('pointermove', muovi, { passive: false });
    window.addEventListener('pointerup', su);
    window.addEventListener('pointercancel', su);
    $('maniglia').addEventListener('click', () => apri(!aperta));
  })();

  if ('ResizeObserver' in window) new ResizeObserver(misuraScheda).observe($('cima'));
  window.addEventListener('resize', () => { misuraScheda(); applicaMargini(); });
  largo.addEventListener('change', () => { misuraScheda(); applicaMargini(); });

  // ---------- Inquadrature ----------
  function inquadra() {
    const i = mostrata();
    if (!map || i == null) return;
    const p = punti[i];
    if (io && !ioLontano && metri(io.lat, io.lon, p[0], p[1]) < 4000) {
      const b = new maplibregl.LngLatBounds([io.lon, io.lat], [io.lon, io.lat]).extend([p[1], p[0]]);
      map.fitBounds(b, { padding: { top: 70, bottom: 70, left: 60, right: 76 }, maxZoom: 17, duration: 1100, essential: true });
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
      el.innerHTML = '<div class="cono" id="cono"><svg viewBox="-60 -60 120 120" aria-hidden="true">' +
        '<defs><radialGradient id="cono-sfuma" cx="0" cy="0" r="58" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0.15" stop-color="#d9a93f" stop-opacity=".75"/>' +
        '<stop offset="1" stop-color="#d9a93f" stop-opacity="0"/></radialGradient></defs>' +
        '<path id="cono-spicchio" fill="url(#cono-sfuma)"/></svg></div>';
      segnoIo = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([io.lon, io.lat]).addTo(map);
      disegnaCono();
    } else segnoIo.setLngLat([io.lon, io.lat]);
  }

  // ---------- Direzione (bussola) ----------
  let rotta = null;          // gradi da nord, già filtrati
  let rottaGrezza = null;    // ultimo valore letto
  let ampiezza = 50;         // apertura del cono in gradi: più larga se la bussola è incerta
  let ultimaBussola = 0;
  let giroCono = 0;

  function angoloSchermo() {
    if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }
  function nuovaRotta(gradi, incertezza) {
    if (gradi == null || isNaN(gradi)) return;
    rottaGrezza = ((gradi % 360) + 360) % 360;
    if (incertezza != null && incertezza >= 0) ampiezza = Math.min(110, Math.max(40, incertezza * 2));
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
    const mezzo = ampiezza / 2 * RAD, r = 58;
    const x = (r * Math.sin(mezzo)).toFixed(1), y = (-r * Math.cos(mezzo)).toFixed(1);
    document.getElementById('cono-spicchio').setAttribute('d',
      'M0 0L' + (-x) + ' ' + y + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + y + 'Z');
    const giro = rotta - (map ? map.getBearing() : 0);
    cono.style.transform = 'rotate(' + giro.toFixed(1) + 'deg)';
    cono.classList.add('vista');
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
    const mosso = !io || metri(io.lat, io.lon, c.latitude, c.longitude) > 4;
    io = { lat: c.latitude, lon: c.longitude };
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
  $('btn-piu').addEventListener('click', () => map && map.zoomIn({ duration: 350 }));
  $('btn-meno').addEventListener('click', () => map && map.zoomOut({ duration: 350 }));
  $('btn-centra').addEventListener('click', () => {
    if (!map) return;
    chiediBussola();
    if (io && !ioLontano) { fissata = null; aggiorna(); inquadra(); }
    else if (io && ioLontano) map.flyTo({ center: ROMA, zoom: 15.4, duration: 1200 });
    else { primaVista = true; seguiPosizione(); }
  });
  $('btn-sblocca').addEventListener('click', () => { fissata = null; aggiorna(); inquadra(); });

  $('filtri').addEventListener('click', (e) => {
    const b = e.target.closest('.filtro');
    if (!b || !punti.length) return;
    // Toccare di nuovo il filtro attivo torna a mostrarle tutte.
    filtro = filtro === b.dataset.t ? 't' : b.dataset.t;
    document.querySelectorAll('.filtro').forEach((f) => {
      const attivo = f.dataset.t === filtro;
      f.classList.toggle('attivo', attivo);
      f.setAttribute('aria-pressed', String(attivo));
    });
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
  $('btn-info').addEventListener('click', () => { $('info-dati').textContent = testoDati(); $('info').showModal(); });
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
    if (leggiSalvati()) {
      const vecchi = Date.now() - quando > GIORNI_VALIDITA * 864e5;
      if (vecchi && navigator.onLine) scarica().then(() => { ridisegnaPunti(); aggiorna(); }).catch(() => {});
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
