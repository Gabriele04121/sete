# Sete, le fontanelle di Roma

Una web app che si installa sul telefono come un'app vera. Mostra le fontanelle di Roma e dintorni,
trova la più vicina a te e apre le indicazioni a piedi in Apple Maps o Google Maps.

Non ha server, account o tracciamento. Le fontanelle arrivano da OpenStreetMap e restano salvate sul telefono.

## Metterla online con GitHub Pages (gratis)

Serve un indirizzo HTTPS, altrimenti il telefono non concede la posizione.

1. Crea un account su github.com, se non ce l'hai.
2. Crea un nuovo repository pubblico, per esempio `sete`.
3. Nella pagina del repository scegli "uploading an existing file" e trascina **il contenuto** di questa
   cartella (non la cartella stessa): `index.html` deve stare al primo livello. Conferma con "Commit changes".
4. Vai su Settings, poi Pages. In "Build and deployment" scegli "Deploy from a branch", ramo `main`,
   cartella `/ (root)`, e salva.
5. Dopo un paio di minuti l'app è su `https://TUONOME.github.io/sete/`.

Va bene anche qualunque altro hosting di file statici (Netlify, Cloudflare Pages, il tuo spazio web).

## Installarla sul telefono

- **iPhone**: apri l'indirizzo in Safari, tocca Condividi, poi "Aggiungi alla schermata Home".
- **Android**: apri l'indirizzo in Chrome, tocca il menu con i tre puntini, poi "Aggiungi a schermata Home"
  o "Installa app".

Al primo avvio concedi la posizione. Le fontanelle arrivano subito dalla copia pubblicata con l'app
(`fontanelle.json`), poi si aggiornano da sole.

## Vederla subito sul computer

Scompatta la cartella e apri `index.html` con un doppio clic (meglio in Chrome). Vedi la mappa, le fontanelle
e tutta l'interfaccia. Se il browser non concede la posizione, l'app mostra la fontanella più vicina al centro
della mappa: basta spostarla.

## Come si usa

- La scheda scura in basso mostra la fontanella più vicina, la distanza, i minuti a piedi e il tipo.
  Distanza e "più vicina" sono calcolate sul percorso a piedi vero, non in linea d'aria: una fontanella
  oltre un raccordo o un fiume non viene più indicata come vicina. La linea tratteggiata segue le strade.
  Se il servizio dei percorsi non risponde, la scheda lo dice ("in linea d'aria").
- Trascina la scheda verso l'alto (o tocca la maniglia) per leggere com'è fatta e vedere le altre vicine.
- Trascinala verso il basso per ridurla a una barra sottile e liberare la mappa. La freccia nella barra punta verso
  la fontanella mentre giri il telefono: quando diventa azzurra ce l'hai davanti. Tocca la barra per riaprire la scheda.
- "Indicazioni a piedi" apre il navigatore del telefono.
- I tre filtri in alto mostrano solo nasoni, fontanelle o fontane. Tocca di nuovo il filtro per rivederle tutte.
  L'app ricorda il filtro alla prossima apertura.
- La mappa si ingrandisce con due dita, con il doppio tocco o con i pulsanti + e −.
  Da lontano le fontanelle sono punti colorati, da vicino diventano segni animati, diversi per tipo.
- La freccia a destra riporta la mappa su di te.
- Il fascio dorato attorno al tuo punto mostra dove sta puntando il telefono, come in Google Maps.
  Sull'iPhone la bussola si attiva dopo il primo tocco (Safari chiede il permesso per "movimento e orientamento").
  Se il fascio è largo, la bussola è incerta: muovi il telefono disegnando un 8 per calibrarla.
- Senza posizione, la "più vicina" è quella rispetto al centro della mappa: sposta la mappa per esplorare.
- Il pulsante "i" mostra la legenda, quante fontanelle ci sono e permette di riscaricarle.

## Offline

Dopo la prima apertura l'app e le fontanelle funzionano senza rete. Lo sfondo stradale resta disponibile
solo per le zone che hai già guardato.

## File

| File | Cosa contiene |
|---|---|
| `index.html` | La struttura della pagina |
| `app.css` | Colori, caratteri, impaginazione |
| `app.js` | Dati, posizione, calcolo della più vicina. Le impostazioni sono in cima al file |
| `sw.js` | Funzionamento offline |
| `fontanelle.json` | Copia pronta delle fontanelle, aggiornata dalla GitHub Action |
| `strumenti/` | Script che scarica le fontanelle per `fontanelle.json` |
| `manifest.webmanifest` | Nome e icona dell'app installata |
| `icons/` | Logo (`logo.svg`) e icone |
| `fonts/`, `vendor/` | Caratteri (Big Shoulders, Hanken Grotesk) e libreria della mappa (MapLibre), inclusi nel pacchetto |

Se modifichi i file dopo averla installata, cambia `sete-v8` in `sete-v9` in cima a `sw.js`,
così il telefono scarica la versione nuova.

## Fontanelle sempre aggiornate

La GitHub Action `.github/workflows/fontanelle.yml` scarica ogni lunedì le fontanelle da OpenStreetMap con
`strumenti/fontanelle.mjs` e aggiorna `fontanelle.json`, solo se qualcosa è cambiato. Puoi farla partire a mano
dalla scheda Actions del repository: "Aggiorna le fontanelle", poi "Run workflow".

## Dati e licenze

- Fontanelle: © collaboratori di OpenStreetMap, licenza ODbL. Sono gli elementi `amenity=drinking_water`
  (nasoni se hanno `fountain=nasone`, altrimenti fontanelle) e le fontane `amenity=fountain` con `drinking_water=yes`.
- Mappa: stile Liberty servito da OpenFreeMap, gratuito e senza chiave. Se non risponde, l'app passa da sola
  alla mappa classica di OpenStreetMap.
- Indirizzi: Nominatim (OpenStreetMap), adatto a un uso leggero e personale.
- Percorsi a piedi: server OSRM di FOSSGIS (routing.openstreetmap.de), lo stesso di openstreetmap.org,
  per un uso leggero.
- MapLibre GL JS: licenza BSD. Caratteri: SIL Open Font License.

I dati sono curati da volontari: una fontanella può essere chiusa, spostata o mancare, e molti nasoni
sono registrati come semplici fontanelle.
