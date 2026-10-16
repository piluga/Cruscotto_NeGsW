import { firebaseConfig } from './firebase-config.js?v=sicurezza-1';
import { creaClient } from './firebase-client.js?v=cruscotto-fix-2';
import { riepiloga } from './dati.js?v=statistiche-resi-v2-20261016';

const client = creaClient(firebaseConfig);
const el = id => document.getElementById(id);
const euro = valore => valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
let dataOsservata = new Date(), richiesta = null, versione = 0, dati = null, loginVersione = 0;
let analisiDatiGiorno = null; // CRUSCOTTO_ANALISI_LAZY_V1
const giorno = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function nodo(tag, testo, classe) {
    const n = document.createElement(tag); n.textContent = testo;
    if (classe) n.className = classe;
    return n;
}
function stato(testo, errore = false) {
    el('stato-dati').textContent = testo;
    el('stato-dati').classList.toggle('errore', errore);
}
function etichetta() {
    el('label-data').textContent = dataOsservata.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();
}
function pulisci() {
    dati = null; analisiDatiGiorno = null;
    for (const id of ['totale', 'contanti', 'pos', 'scontrini', 'media', 'entrate', 'uscite']) el('ui-' + id).textContent = '—';
    for (const id of ['lista-operatori', 'lista-prodotti', 'lista-dettaglio-operatore']) el(id).replaceChildren();
    el('titolo-modale-operatore').textContent = 'DETTAGLIO OPERATORE';
    el('modal-dettaglio-operatore').style.display = 'none';
    el('badge-live').style.display = 'none';
}
function annullaRichiesta() { versione++; richiesta?.abort(); richiesta = null; el('btn-manuale').disabled = false; }
function mostraLogin(messaggio = '', terminaSessione = true) {
    loginVersione++; annullaRichiesta(); if (terminaSessione) client.esci(); pulisci();
    el('login-panel').hidden = false; el('main-container').hidden = true; el('sessione').hidden = true;
    el('giorno-prima').disabled = true; el('giorno-dopo').disabled = true;
    el('login-password').value = ''; el('utente').textContent = '';
    el('login-stato').textContent = messaggio || (client.configurato ? 'Accedi con l’account autorizzato al cruscotto.' : 'Configurazione Firebase da completare prima dell’accesso.');
    el('btn-accedi').disabled = !client.configurato;
    stato('Accedi per consultare gli incassi.');
}
function dettaglio(nome) {
    if (!client.autenticato || !dati) return;
    el('titolo-modale-operatore').textContent = 'MOVIMENTI: ' + nome;
    const lista = el('lista-dettaglio-operatore'); lista.replaceChildren();
    for (const m of [...dati.operatori.get(nome).movimenti].sort((a, b) => a.ora.localeCompare(b.ora))) {
        const row = nodo('div', '', 'movimento');
        const descrizione = nodo('span', m.desc); descrizione.title = m.desc;
        row.append(nodo('span', m.ora), descrizione, nodo('strong', (m.tipo === 'USCITA' ? '− ' : '+ ') + euro(m.totale)));
        lista.append(row);
    }
    el('modal-dettaglio-operatore').style.display = 'flex'; el('chiudi-dettaglio').focus();
}
function mostra(d) {
    dati = d;
    for (const id of ['totale', 'contanti', 'pos', 'media', 'entrate', 'uscite']) el('ui-' + id).textContent = euro(d[id]);
    el('ui-scontrini').textContent = d.scontrini;
    const operatori = el('lista-operatori'); operatori.replaceChildren();
    for (const [nome, op] of [...d.operatori].sort((a, b) => b[1].totale - a[1].totale)) {
        if (['CASSA / EXTRA', 'Sconosciuto'].includes(nome)) continue;
        const row = nodo('div', '', 'list-item');
        const button = nodo('button', 'Dettagli', 'btn-nav'); button.addEventListener('click', () => dettaglio(nome));
        row.append(nodo('span', nome), nodo('strong', euro(op.totale)), button); operatori.append(row);
    }
    if (!operatori.children.length) operatori.append(nodo('i', 'Nessuna vendita per operatore'));
    const prodotti = el('lista-prodotti'); prodotti.replaceChildren();
    [...d.prodotti].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([nome, qta], i) => {
        const row = nodo('div', '', 'list-item'); row.append(nodo('span', `${i + 1}. ${nome}`), nodo('strong', `${qta} pz`)); prodotti.append(row);
    });
    if (!prodotti.children.length) prodotti.append(nodo('i', 'Nessun prodotto venduto'));
    el('badge-live').style.display = giorno(dataOsservata) === giorno(new Date()) ? 'inline-block' : 'none';
}
async function aggiorna() {
    if (!client.autenticato) return;
    annullaRichiesta();
    const turno = versione, data = giorno(dataOsservata);
    richiesta = new AbortController();
    el('btn-manuale').disabled = true;
    // Anche il dettaglio deve chiudersi quando cambia la fotografia degli incassi.
    pulisci(); stato('Caricamento degli incassi…');
    try {
        const risultati = await client.leggiGiorno(data, { signal: richiesta.signal });
        if (turno !== versione) return;
        const riepilogo = riepiloga(risultati);
        mostra(riepilogo);
        analisiDatiGiorno = risultati;
        stato((riepilogo.scontrini === 0 && riepilogo.operatori.size === 0 ? 'Nessun movimento per questa giornata. ' : '') + 'Aggiornato alle ' + new Date().toLocaleTimeString('it-IT'));
    } catch (error) {
        if (turno !== versione) return;
        pulisci();
        if (error.code === 'SESSIONE') mostraLogin(error.message);
        else stato(error.message || 'Impossibile caricare i dati. Riprova.', true);
    } finally {
        if (turno === versione) { richiesta = null; el('btn-manuale').disabled = false; }
    }
}
function cambiaGiorno(delta) {
    if (!client.autenticato) return;
    dataOsservata.setDate(dataOsservata.getDate() + delta); etichetta(); aggiorna();
}
el('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const turno = ++loginVersione;
    el('btn-accedi').disabled = true; el('login-stato').textContent = 'Accesso in corso…';
    const email = el('login-email').value, password = el('login-password').value;
    el('login-password').value = '';
    try {
        await client.accedi(email, password, Boolean(el('resta-connesso')?.checked));
        if (turno !== loginVersione) return;
        el('login-panel').hidden = true; el('main-container').hidden = false; el('sessione').hidden = false;
        el('utente').textContent = email.trim(); el('login-stato').textContent = '';
        el('giorno-prima').disabled = false; el('giorno-dopo').disabled = false;
        await aggiorna();
    } catch (error) { if (turno === loginVersione) el('login-stato').textContent = error.message; }
    finally { if (turno === loginVersione) el('btn-accedi').disabled = !client.configurato; }
});
el('btn-esci').addEventListener('click', () => mostraLogin('Accesso terminato.'));
el('giorno-prima').addEventListener('click', () => cambiaGiorno(-1));
el('giorno-dopo').addEventListener('click', () => cambiaGiorno(1));
el('btn-manuale').addEventListener('click', aggiorna);
el('chiudi-dettaglio').addEventListener('click', () => { el('modal-dettaglio-operatore').style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') el('modal-dettaglio-operatore').style.display = 'none'; });
let touch = null;
el('main-container').addEventListener('touchstart', e => {
    if (e.target.closest('button, input')) return;
    const t = e.changedTouches[0]; touch = { x: t.screenX, y: t.screenY };
}, { passive: true });
el('main-container').addEventListener('touchend', e => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.screenX - touch.x, dy = t.screenY - touch.y; touch = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) cambiaGiorno(dx < 0 ? 1 : -1);
}, { passive: true });
window.addEventListener('offline', () => { if (client.autenticato) { annullaRichiesta(); pulisci(); stato('Sei offline. Riconnettiti per consultare gli incassi.', true); } });
window.addEventListener('online', aggiorna);
// Evita di lasciare incassi/sessioni nel back-forward cache dopo l'uscita dalla pagina.
// CRUSCOTTO_PERSIST_V1: nessun logout automatico a pagehide; logout esplicito via ESCI.
setInterval(() => { if (!document.hidden && !richiesta && giorno(dataOsservata) === giorno(new Date())) aggiorna(); }, 30000);
// CRUSCOTTO_INSTALL_V1: opzione di installazione quando il browser offre il prompt.
const installStatus = el('stato-pwa');
const installButton = document.createElement('button');
installButton.type = 'button';
installButton.textContent = 'Installa Cruscotto';
installButton.className = 'btn-nav';
installButton.hidden = true;
installButton.style.margin = '8px';
if (installStatus) installStatus.insertAdjacentElement('afterend', installButton);
else document.body.appendChild(installButton);
let deferredInstall = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (!standalone() && installStatus) {
    installStatus.textContent = !window.isSecureContext ?
        'Installazione disponibile solo su HTTPS o localhost.' :
        'Se non compare Installa, usa il menu del browser oppure verifica che lâ€™app non sia gia installata.';
}
window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferredInstall = event;
    if (!standalone()) installButton.hidden = false;
    if (installStatus) installStatus.textContent = 'Cruscotto pronto per lâ€™installazione.';
});
window.addEventListener('appinstalled', () => {
    deferredInstall = null; installButton.hidden = true;
    if (installStatus) installStatus.textContent = 'Cruscotto installato.';
});
installButton.addEventListener('click', async () => {
    if (!deferredInstall) return;
    const prompt = deferredInstall; deferredInstall = null; installButton.hidden = true;
    try { await prompt.prompt(); await prompt.userChoice; } catch {}
});
// Checkbox facoltativa: la password non viene mai conservata.
const loginForm = el('login-form');
const rememberLabel = document.createElement('label');
rememberLabel.style.cssText = 'display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px;cursor:pointer;';
const rememberCheckbox = document.createElement('input');
rememberCheckbox.type = 'checkbox'; rememberCheckbox.id = 'resta-connesso';
rememberLabel.append(rememberCheckbox, document.createTextNode('Resta connesso su questo dispositivo'));
const submitLogin = el('btn-accedi');
if (submitLogin) submitLogin.parentElement.insertBefore(rememberLabel, submitLogin);
else loginForm.appendChild(rememberLabel);
async function provaRipristino() {
    const recovered = await client.ripristina();
    if (!recovered) return;
    el('login-email').value = recovered.email;
    el('login-panel').hidden = true; el('main-container').hidden = false; el('sessione').hidden = false;
    el('utente').textContent = recovered.email;
    el('giorno-prima').disabled = false; el('giorno-dopo').disabled = false;
    await aggiorna();
}
etichetta(); mostraLogin('', false); provaRipristino().catch(console.warn);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
    el('stato-pwa').textContent = 'Installazione offline non disponibile; puoi usare il cruscotto online.';
});

// CRUSCOTTO_ANALISI_LAZY_V1 — caricamento opzionale, mai prima del login.
(() => {
    const principale = document.getElementById('main-container');
    if (!principale) return;
    const pulsante = document.createElement('button');
    pulsante.type = 'button'; pulsante.className = 'btn-nav';
    pulsante.textContent = '📈 Analisi Avanzata';
    pulsante.style.cssText = 'display:block;margin:12px auto;padding:10px 16px;';
    principale.appendChild(pulsante);
    let overlay = null;
    pulsante.addEventListener('click', async () => {
        if (!client.autenticato) return;
        overlay?.remove();
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.83);z-index:99999;display:flex;align-items:center;justify-content:center;padding:14px;';
        const pannello = document.createElement('section');
        pannello.style.cssText = 'box-sizing:border-box;width:min(850px,100%);max-height:90vh;overflow:auto;border-radius:12px;padding:20px;background:#171c27;color:#f5f5f5;border:1px solid #c5a044;';
        const intestazione = document.createElement('div');
        intestazione.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:16px;';
        const titolo = document.createElement('h2'); titolo.textContent = '📈 Analisi Avanzata';
        const chiudi = document.createElement('button'); chiudi.type='button'; chiudi.textContent='CHIUDI'; chiudi.className='btn-nav';
        chiudi.addEventListener('click', () => {overlay?.remove();overlay=null;});
        intestazione.append(titolo,chiudi);
        const contenuto = document.createElement('div'); contenuto.textContent = 'Caricamento del modulo…';
        pannello.append(intestazione, contenuto); overlay.append(pannello); document.body.append(overlay);
        try {
            const modulo = await import('./analisi-avanzata.js?v=lazy-v1');
            if (!overlay?.isConnected) return;
            if (!analisiDatiGiorno) throw new Error('Nessun dato disponibile per la data selezionata. Premi AGGIORNA e riprova.');
            modulo.renderAnalisi(contenuto, analisiDatiGiorno);
        } catch (errore) {
            console.warn('Analisi Avanzata non disponibile:', errore);
            contenuto.textContent = 'Analisi Avanzata non disponibile. Il Cruscotto principale continua a funzionare. Dettaglio: ' + (errore?.message || 'errore di caricamento');
        }
    });
})();
