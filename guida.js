// Sete: logica pura della navigazione guidata (niente DOM, niente mappa).
// Si usa come window.SeteGuida nel browser e con require() in node, per le prove.
(function (radice) {
  'use strict';

  const RAD = Math.PI / 180;
  const R = 6371000;

  // Soglie, in metri e secondi
  const ORIGINE_MIN = 3;        // sotto, l'origine coincide già con il primo punto del percorso
  const FINESTRA_INDIETRO = 20; // il progresso può tornare indietro di poco (rumore GPS)
  const FINESTRA_AVANTI = 60;   // e avanzare fino a qui tra una lettura e l'altra (se non si conosce il tempo)
  const MAX_INDIETRO = 6;       // dopo la media, un passo indietro non supera questo
  const PESO_NUOVO = 0.4;       // media mobile del progresso lungo la linea
  const MIN_LETTURE = 2;        // letture consecutive lontane dal percorso per dichiarare "fuori strada"
  const MIN_MS_FUORI = 8000;    // e almeno questo tempo
  const SOGLIA_AGGANCIO = 25;   // sotto, la posizione mostrata è quella sul percorso
  const SOGLIA_SGANCIO = 35;    // una volta agganciata, la posizione si stacca solo oltre
  const DISTANZA_DIREZIONE = 25;

  function metri(aLat, aLon, bLat, bLon) {
    const x = (bLon - aLon) * RAD * Math.cos(((aLat + bLat) / 2) * RAD);
    const y = (bLat - aLat) * RAD;
    return Math.sqrt(x * x + y * y) * R;
  }
  function gradiVerso(aLat, aLon, bLat, bLon) {
    const y = Math.sin((bLon - aLon) * RAD) * Math.cos(bLat * RAD);
    const x = Math.cos(aLat * RAD) * Math.sin(bLat * RAD) -
      Math.sin(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((bLon - aLon) * RAD);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }
  // Piano locale in metri: basta e avanza per qualche chilometro.
  function piano(lat, lon) {
    return [lon * RAD * Math.cos(41.9 * RAD) * R, lat * RAD * R];
  }

  // ---------- Costruzione della guida ----------
  // via: routes[0] di OSRM. origine: {lat, lon} dell'utente. meta: {lat, lon} della fontanella.
  // La geometria parte dall'utente e finisce sulla fontanella; gli `at` dei passi sono metri dall'inizio.
  function prepara(via, origine, meta) {
    const geom = via.geometry.coordinates.map((c) => [c[0], c[1]]);
    const lunghezzaOsrm = (g) => {
      let t = 0;
      for (let k = 1; k < g.length; k++) t += metri(g[k - 1][1], g[k - 1][0], g[k][1], g[k][0]);
      return t;
    };
    const lunga = lunghezzaOsrm(geom);
    const scala = via.distance > 0 ? lunga / via.distance : 1;
    let testa = 0;
    if (origine && geom.length) {
      testa = metri(origine.lat, origine.lon, geom[0][1], geom[0][0]);
      if (testa > ORIGINE_MIN) geom.unshift([origine.lon, origine.lat]);
      else testa = 0;
    }
    if (meta && geom.length) {
      const u = geom[geom.length - 1];
      if (metri(u[1], u[0], meta.lat, meta.lon) > ORIGINE_MIN) geom.push([meta.lon, meta.lat]);
    }
    const cum = [0];
    for (let k = 1; k < geom.length; k++) cum.push(cum[k - 1] + metri(geom[k - 1][1], geom[k - 1][0], geom[k][1], geom[k][0]));
    const tot = cum[cum.length - 1];
    const passi = [];
    let somma = 0;
    ((via.legs && via.legs[0] && via.legs[0].steps) || []).forEach((st, n) => {
      const m = st.maneuver || {};
      const arrivo = m.type === 'arrive';
      passi.push({
        tipo: m.type || '', mod: m.modifier || '', nome: st.name || '', uscita: m.exit,
        at: arrivo ? tot : (n === 0 ? 0 : testa + somma * scala)
      });
      somma += st.distance || 0;
    });
    return { geom, cum, tot, passi, t: Date.now() };
  }

  // ---------- Posizione sul percorso ----------
  function segmentoDi(guida, cum) {
    const c = guida.cum;
    let a = 0, b = c.length - 2;
    if (b < 0) return 0;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (c[m] <= cum) a = m; else b = m - 1;
    }
    return a;
  }
  // [lon, lat] del punto a `cum` metri dall'inizio
  function puntoA(guida, cum) {
    const g = guida.geom, c = guida.cum;
    if (cum <= 0) return g[0];
    if (cum >= guida.tot) return g[g.length - 1];
    const k = segmentoDi(guida, cum);
    const t = c[k + 1] > c[k] ? (cum - c[k]) / (c[k + 1] - c[k]) : 0;
    return [g[k][0] + t * (g[k + 1][0] - g[k][0]), g[k][1] + t * (g[k + 1][1] - g[k][1])];
  }
  function proiezione(guida, q, k) {
    const g = guida.geom;
    const a = piano(g[k][1], g[k][0]), b = piano(g[k + 1][1], g[k + 1][0]);
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    return { cum: guida.cum[k] + t * (guida.cum[k + 1] - guida.cum[k]), off: Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy), seg: k };
  }
  // Il segmento più vicino tra `da` e `a` metri; con `rif` (progresso di prima) si preferiscono i punti
  // vicini a lì: un tratto di percorso che torna accanto a sé stesso non ruba la posizione per pochi metri.
  function migliorePer(guida, q, da, a, rif) {
    let m = null, costo = Infinity;
    for (let k = 0; k < guida.geom.length - 1; k++) {
      if (guida.cum[k + 1] < da || guida.cum[k] > a) continue;
      const p = proiezione(guida, q, k);
      const c = p.off + (rif == null ? 0 : 0.25 * Math.max(0, p.cum - rif - 10, rif - p.cum - 5));
      if (c < costo) { costo = c; m = p; }
    }
    return m;
  }
  // Dove sei sul percorso: {cum, off, seg, lat, lon, crudo}. `precedente` è il risultato della lettura prima:
  // si cerca vicino a lì (poco indietro, molto avanti) così un percorso che torna su se stesso non fa saltare.
  // `off` è la distanza vera dalla linea; `cum` è addolcito e non torna indietro di più di MAX_INDIETRO.
  // `adessoMs` (facoltativo) serve ad allargare la finestra se tra due letture è passato molto tempo.
  function progresso(guida, lat, lon, precedente, adessoMs) {
    if (!guida || !guida.geom || guida.geom.length < 2) return null;
    const q = piano(lat, lon);
    let m = null, salto = false;
    const primo = !precedente || !isFinite(precedente.cum);
    // la guida nasce dall'utente: senza lettura precedente si parte dall'inizio del percorso
    const rif = primo ? 0 : precedente.cum;
    let avanti = FINESTRA_AVANTI;
    if (!primo && precedente.t && adessoMs) avanti = Math.max(45, Math.min(200, 45 + 3 * (adessoMs - precedente.t) / 1000));
    m = migliorePer(guida, q, rif - FINESTRA_INDIETRO, rif + avanti, rif);
    // se nella finestra sei lontano ma altrove sei molto più vicino, la finestra era sbagliata
    if (!m || m.off > 40) {
      const tutto = migliorePer(guida, q, -Infinity, Infinity, null);
      if (!m || tutto.off < m.off - 25) { m = tutto; salto = true; }
    }
    let cum = m.cum;
    if (!primo && !salto) {
      cum = precedente.cum + PESO_NUOVO * (m.cum - precedente.cum);
      cum = Math.max(cum, precedente.cum - MAX_INDIETRO);
    }
    cum = Math.max(0, Math.min(guida.tot, cum));
    const p = puntoA(guida, cum);
    return { cum, off: m.off, seg: segmentoDi(guida, cum), lat: p[1], lon: p[0], crudo: m.cum, t: adessoMs || 0 };
  }

  // ---------- Fuori strada, con isteresi ----------
  function sogliaFuori(acc) { return Math.max(40, (acc || 0) * 1.2 + 15); }
  function sogliaRientro(acc) { return Math.max(25, (acc || 0) * 0.8 + 8); }
  const STATO_INIZIALE = { fuori: false, da: 0, conteggio: 0 };
  // Stato precedente {fuori, da, conteggio} -> nuovo stato. Chiamarla una volta per ogni lettura GPS.
  function statoStrada(prec, off, acc, adessoMs) {
    prec = prec || STATO_INIZIALE;
    if (prec.fuori) {
      if (off < sogliaRientro(acc)) return { fuori: false, da: 0, conteggio: 0 };
      return { fuori: true, da: prec.da, conteggio: prec.conteggio + 1 };
    }
    if (off > sogliaFuori(acc)) {
      const conteggio = prec.conteggio + 1;
      const da = prec.conteggio > 0 ? prec.da : adessoMs;
      return { fuori: conteggio >= MIN_LETTURE && adessoMs - da >= MIN_MS_FUORI, da, conteggio };
    }
    // tra il 70% della soglia e la soglia: lettura incerta, il conteggio resta com'è
    if (off > sogliaFuori(acc) * 0.7 && prec.conteggio > 0) return { fuori: false, da: prec.da, conteggio: prec.conteggio };
    return { fuori: false, da: 0, conteggio: 0 };
  }

  // La posizione da mostrare: sul percorso quando sei in strada, altrimenti quella del GPS.
  // `agganciata` dice se alla lettura prima era già sul percorso (isteresi, niente sfarfallio).
  function posizioneAgganciata(prog, io, stato, agganciata) {
    if (!io) return null;
    if (!prog || (stato && stato.fuori)) return { lat: io.lat, lon: io.lon, agganciata: false };
    const soglia = Math.max(agganciata ? SOGLIA_SGANCIO : SOGLIA_AGGANCIO, 0);
    if (prog.off < soglia || prog.off < (io.acc || 0) * 0.9) return { lat: prog.lat, lon: prog.lon, agganciata: true };
    return { lat: io.lat, lon: io.lon, agganciata: false };
  }

  // Direzione di marcia (gradi da nord): quella del percorso 25 m più avanti di dove sei.
  function direzione(guida, prog) {
    if (!guida || !prog) return null;
    let da = prog.cum, a = Math.min(guida.tot, prog.cum + DISTANZA_DIREZIONE);
    if (a - da < 5) { a = guida.tot; da = Math.max(0, guida.tot - DISTANZA_DIREZIONE); }
    const p = puntoA(guida, da), q = puntoA(guida, a);
    if (p[0] === q[0] && p[1] === q[1]) return null;
    return gradiVerso(p[1], p[0], q[1], q[0]);
  }

  // Il tratto che resta: dal punto sul percorso fino alla fontanella, come [[lon, lat], ...]
  function restante(guida, prog) {
    return [puntoA(guida, prog.cum)].concat(guida.geom.slice(prog.seg + 1));
  }

  // ---------- Passi e frasi ----------
  // Prossima manovra: la prima più avanti di dove sei (la partenza non conta).
  function prossimoPasso(guida, prog) {
    const passi = guida.passi;
    if (!passi.length) return { indice: -1, passo: null, distanza: Math.max(0, guida.tot - prog.cum), poi: null };
    let k = passi.findIndex((ps, n) => n > 0 && ps.at > prog.cum + 3);
    if (k < 0) k = passi.length - 1;
    const ps = passi[k], dopo = passi[k + 1];
    return {
      indice: k,
      passo: ps,
      distanza: Math.max(0, (ps ? ps.at : guida.tot) - prog.cum),
      poi: dopo && dopo.at - ps.at < 60 ? dopo : null
    };
  }
  function verbo(m) {
    return ({
      left: 'Gira a sinistra', right: 'Gira a destra',
      'slight left': 'Tieni la sinistra', 'slight right': 'Tieni la destra',
      'sharp left': 'Svolta stretta a sinistra', 'sharp right': 'Svolta stretta a destra',
      uturn: 'Torna indietro', straight: 'Prosegui dritto'
    })[m] || 'Prosegui';
  }
  function frase(p) {
    if (!p) return '';
    const inVia = p.nome ? ' in ' + p.nome : '', suVia = p.nome ? ' su ' + p.nome : '';
    if (p.tipo === 'arrive') return 'La fontanella è ' + (/right/.test(p.mod) ? 'sulla destra' : /left/.test(p.mod) ? 'sulla sinistra' : 'davanti a te');
    if (/roundabout|rotary/.test(p.tipo)) return 'Alla rotonda prendi la ' + (p.uscita ? p.uscita + 'ª ' : '') + 'uscita' + inVia;
    if (p.tipo === 'depart') return 'Parti' + suVia;
    if ((p.tipo === 'continue' || p.tipo === 'new name') && (!p.mod || p.mod === 'straight')) return 'Prosegui' + suVia;
    return verbo(p.mod) + (p.mod === 'straight' ? suVia : inVia);
  }

  const api = {
    prepara, progresso, statoStrada, posizioneAgganciata, direzione, restante, puntoA,
    prossimoPasso, frase, verbo, sogliaFuori, sogliaRientro, metri, gradiVerso, piano,
    STATO_INIZIALE
  };
  radice.SeteGuida = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
