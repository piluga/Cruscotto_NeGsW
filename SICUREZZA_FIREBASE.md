# Cruscotto 1.0.0 — adeguamento Firebase (1 ottobre 2026)

## Stato

Codice locale predisposto per autenticazione email/password, rinnovo del token e letture autenticate. Non sono state pubblicate regole, creati utenti o lette informazioni del database operativo. `firebase-config.js` contiene la configurazione pubblica fornita dal titolare per il progetto `fidelity-gestionale`. La cache PWA è aggiornata a `cruscotto-sicurezza-v3`. Il titolare ha fornito l’UID dell’account dedicato: `gahK7ocS8EQwSTs3mfuQAQiEYNL2`. Restano da verificare il login reale e l’attivazione delle regole remote. Finché le regole remote restano pubbliche, la schermata login non rende privato il database.

## Analisi e correzioni

- Prima: tre GET anonime e aggiornamento ogni 30 secondi; un 401/403 veniva ignorato e poteva apparire come incasso zero o totale parziale.
- Ora: nessun GET prima del login; ciascuna lettura usa il Firebase ID token. Un solo rinnovo per le richieste contemporanee; token/password non persistono in localStorage, sessionStorage o cache. Riaprire o ricaricare la pagina richiede un nuovo login.
- Nessuna API di scrittura del database è esposta dal client. La garanzia di sola lettura deve essere applicata anche nelle regole Firebase.
- Errori di rete, sessione e autorizzazione sono distinti da una giornata senza movimenti. I tre archivi devono essere disponibili insieme; in caso di errore i dati vengono rimossi dallo schermo, non convertiti in zero.
- Logout cancella dati e token in memoria, chiude i dettagli e invalida le richieste in corso. Il cambio data impedisce alle risposte vecchie di sovrascrivere la nuova giornata.
- Rimossi eventi HTML eseguibili e API globali; nomi e descrizioni passano attraverso textContent, titoli e listener DOM. Aggiunte CSP e referrer-policy.
- Deduplicazione su tipo e ID completo, con conversione del solo prefisso MOV_ usato dalla cassa nel live. Lo storico prevale sulla copia live; vendite e movimenti non si sovrascrivono se hanno la stessa chiave. Gli UUID diversi con le stesse cifre restano distinti.
- Cache PWA nuova, eliminazione delle sole vecchie cache cruscotto; vengono conservate esclusivamente risorse locali dell'app. Token, risposte Firebase e autenticazione sono esclusi.

## Account cruscotto predisposto

UID fornito dal titolare: `gahK7ocS8EQwSTs3mfuQAQiEYNL2`.

`firebase/accessi-cruscotto.json` contiene l’elenco locale degli account autorizzati, con valore booleano `true`. Questo file non viene letto dal browser, non è nella cache PWA e non concede da solo permessi al database remoto.

Alla fase di attivazione delle regole coordinate, creare dalla console/backend la singola voce `accessi/cruscotto/gahK7ocS8EQwSTs3mfuQAQiEYNL2 = true` nel Realtime Database. Preservare eventuali altri UID già presenti. Il file rappresenta il contenuto del nodo `accessi/cruscotto`, non della radice: non importarlo alla radice né sostituire il database. Non aggiungere regole di scrittura client per il nodo `accessi`.

Con il modello di regole incluso, l’account può leggere esclusivamente `vendite_live`, `storico_vendite` e `storico_movimenti`; tutte le scritture restano negate. Sul database operativo i permessi dipendono ancora dalle regole attualmente pubblicate: questa configurazione locale non revoca gli accessi pubblici esistenti.

## Configurazione per la prova reale

1. Nella console Firebase, abilitare Authentication → provider Email/Password e creare un account dedicato al titolare/direzione. Non riutilizzare l'account futuro della cassa o un cliente. Conservare password fuori dal progetto e dalle chat.
2. Configurazione pubblica già inserita in `firebase-config.js`; l'URL del database coincide con quello originale del cruscotto. Se si cambia URL, aggiornare anche il dominio consentito in `connect-src` di `index.html`.
3. Preparare in ambiente di prova l'elenco degli UID autorizzati, ad esempio `accessi/cruscotto/<UID>` con valore booleano `true`. Tale elenco si amministra dalla console/backend, mai dal client. Un account autenticato non presente deve essere rifiutato.
4. Collaudare con account autorizzato, non autorizzato e senza login. Verificare che tutte le scritture siano negate e che funzionino i filtri GIORNO/data. I test locali simulano Firebase; non certificano le regole pubblicate.

## Regole: attivazione coordinata ancora necessaria

`firebase/cruscotto.rules.example.json` è un modello **solo per un database di prova isolato**, non un aggiornamento da incollare sul database condiviso. Nega tutto salvo le tre letture del cruscotto all'UID autorizzato. Conserva gli indici di ricerca. Non contiene le autorizzazioni della cassa e del portale: pubblicarlo ora sul database operativo interromperebbe la cassa.

La prossima fase deve adeguare portale clienti e autenticazione della cassa; successivamente comporre e collaudare le regole definitive e pubblicarle insieme ai client compatibili. Eliminare ogni `.read: true`/`.write: true` sugli archivi protetti: un permesso pubblico su un antenato non può essere ristretto dai figli. Evitare la regola generica `auth != null` per tutti i dati.

Permessi previsti: direzione in sola lettura sui tre archivi; cassa con scritture commerciali autorizzate; ogni cliente limitato alla propria scheda/messaggi, senza modifica dei punti. Questo intervento riguarda soltanto il primo client.

## Avvio, aggiornamento e test

Sul PC fare doppio clic su **Avvia Cruscotto.bat** (richiede Python 3.9 o successivo, già presente sul PC del gestionale). Il comando apre il browser su `http://127.0.0.1:8766/index.html`; se la porta è occupata sceglie una porta libera e mostra l'URL nella finestra. Lasciare aperta la finestra del server durante l'uso; alla fine chiudere il cruscotto e fermare il server con Ctrl+C. Nessun processo della cassa viene toccato.

Il server ascolta solo su 127.0.0.1 e pubblica esclusivamente i file dell'app; sorgenti Python, test, documentazione ed elenchi di autorizzazione non sono serviti. In alternativa pubblicare la cartella su HTTPS. Aprendo index.html direttamente come file, un messaggio spiega come avviare correttamente l'app, senza tentare il caricamento dei moduli o del manifest tramite file://. La configurazione pubblica non è una credenziale di accesso. Il client usa le API REST ufficiali e non richiede librerie di produzione esterne.

Dopo ogni modifica pubblicata alle risorse, compresa la configurazione, incrementare CACHE_NAME in sw.js. Nel passaggio dalla vecchia versione chiudere tutte le finestre/PWA del cruscotto e riaprirlo dal sito aggiornato. La nuova cache comprende soltanto questa app: non cancellare i dati del gestionale.

Per i test: Node.js >=22, Chrome, `npm install`, quindi `npm test`. I test usano server locale, profili temporanei e risposte simulate, senza accessi al Firebase reale. Coprono login, refresh, revoca, permessi, timeout, logout, conteggi, contenuti HTML, risposte fuori ordine e PWA offline.

Fonti ufficiali: [Firebase Auth REST](https://firebase.google.com/docs/reference/rest/auth), [autenticazione Realtime Database REST](https://firebase.google.com/docs/database/rest/auth), [regole e propagazione dei permessi](https://firebase.google.com/docs/database/security/core-syntax).
