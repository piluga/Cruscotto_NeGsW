import { firebaseConfig } from './firebase-config.js?v=sicurezza-1';
import { creaClient } from './firebase-client.js?v=sicurezza-1';
import { riepiloga } from './dati.js?v=sicurezza-1';

const client = creaClient(firebaseConfig);
const el = id => document.getElementById(id);
const euro = valore => valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
let dataOsservata = new Date(), richiesta = null, versione = 0, dati = null, loginVersione = 0;
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
    dati = null;
    for (const id of ['totale', 'contanti', 'pos', 'scontrini', 'media', 'entrate', 'uscite']) el('ui-' + id).textContent = '—';
    for (const id of ['lista-operatori', 'lista-prodotti', 'lista-dettaglio-operatore']) el(id).replaceChildren();
    el('titolo-modale-operatore').textContent = 'DETTAGLIO OPERATORE';
    el('modal-dettaglio-operatore').style.display = 'none';
    el('badge-live').style.display = 'none';
}
function annullaRichiesta() { versione++; richiesta?.abort(); richiesta = null; el('btn-manuale').disabled = false; }
function mostraLogin(messaggio = '') {
    loginVersione++; annullaRichiesta(); client.esci(); pulisci();
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
        await client.accedi(email, password);
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
window.addEventListener('pagehide', () => mostraLogin());
setInterval(() => { if (!document.hidden && !richiesta && giorno(dataOsservata) === giorno(new Date())) aggiorna(); }, 30000);
etichetta(); mostraLogin();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {
    el('stato-pwa').textContent = 'Installazione offline non disponibile; puoi usare il cruscotto online.';
});
