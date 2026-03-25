const FIREBASE_URL = "https://fidelity-gestionale-default-rtdb.europe-west1.firebasedatabase.app";
let dataOsservata = new Date();
let timerAutoRefresh = null;

function aggiornaEtichettaData() {
    const opzioni = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('label-data').textContent = dataOsservata.toLocaleDateString('it-IT', opzioni).toUpperCase();
    
    let oggi = new Date();
    let isOggi = dataOsservata.toDateString() === oggi.toDateString();
    document.getElementById('badge-live').style.display = isOggi ? 'inline-block' : 'none';
}

function cambiaGiorno(delta) {
    const container = document.getElementById('main-container');

    // 1. Fai scivolare via i dati attuali nella direzione corretta
    container.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
    container.classList.add(delta > 0 ? 'swipe-out-left' : 'swipe-out-right');

    // Aspetta che l'animazione di uscita finisca (200 millisecondi) prima di caricare i nuovi
    setTimeout(() => {
        // 2. Cambia la data e scarica i nuovi dati dal Cloud
        dataOsservata.setDate(dataOsservata.getDate() + delta);
        aggiornaEtichettaData();
        scaricaDatiLive();

        // 3. Sposta istantaneamente (senza animazione) il container sul lato opposto, pronto per entrare
        container.style.transition = 'none';
        container.classList.remove('swipe-out-left', 'swipe-out-right');
        container.classList.add(delta > 0 ? 'swipe-in-right' : 'swipe-in-left');

        // Forza il browser a registrare la nuova posizione invisibile (Reflow)
        void container.offsetWidth;

        // 4. Riattiva l'animazione e fallo scivolare dolcemente al centro dello schermo!
        container.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
        container.classList.remove('swipe-in-left', 'swipe-in-right');

    }, 200);
}

function getGiornoString(d) {
    let anno = d.getFullYear(); 
    let mese = String(d.getMonth() + 1).padStart(2, '0'); 
    let giorno = String(d.getDate()).padStart(2, '0');
    return `${anno}-${mese}-${giorno}`;
}

// Variabile globale per salvare i movimenti divisi per operatore
window.datiOperatoriGlobale = {};

async function scaricaDatiLive() {
    if (!navigator.onLine) { mostraAvviso("Sei offline!"); return; }

    const giornoStr = getGiornoString(dataOsservata);
    let data = {}; 

    try {
        let resLive = await fetch(`${FIREBASE_URL}/vendite_live/${giornoStr}.json`);
        if (resLive.ok) {
            let d = await resLive.json();
            if (d && !d.error) Object.assign(data, d);
        }

        let resStoricoV = await fetch(`${FIREBASE_URL}/storico_vendite.json?orderBy="GIORNO"&equalTo="${giornoStr}"`);
        if (resStoricoV.ok) {
            let d = await resStoricoV.json();
            if (d && !d.error) {
                Object.keys(d).forEach(k => { 
                    d[k].tipo = "VENDITA"; 
                    d[k].totale = (d[k].CONTANTI || 0) + (d[k].POS || 0);
                    d[k].contanti = d[k].CONTANTI || 0;
                    d[k].pos = d[k].POS || 0;
                    d[k].operatore = d[k].OPERATORE || "Sconosciuto";
                    d[k].ora = d[k].ORA || "-";
                    d[k].articoli = d[k].ARTICOLI || [];
                });
                Object.assign(data, d);
            }
        }

        let resStoricoM = await fetch(`${FIREBASE_URL}/storico_movimenti.json?orderBy="data"&equalTo="${giornoStr}"`);
        if (resStoricoM.ok) {
            let d = await resStoricoM.json();
            if (d && !d.error) Object.assign(data, d);
        }

    } catch (error) { console.error("Errore fetch dati:", error); }

    let totVendite = 0; let totContanti = 0; let totPos = 0; let numScontrini = 0;
    let totEntrateExtra = 0; let totUscite = 0;
    let statOperatori = {}; let statProdotti = {};
    
    window.datiOperatoriGlobale = {};

    // 🚀 FIX: MOTORE DI DEDUPLICAZIONE ANTI-CLONI
    let recordProcessati = new Set();

    let chiavi = Object.keys(data);
    if (chiavi.length > 0) {
        chiavi.forEach(id => {
            let record = data[id];
            let tipo = record.tipo ? record.tipo : "VENDITA";
            
            // Crea una chiave unica estraendo solo i numeri per riconoscere il record clonato
            let numericId = String(record.id || id).replace(/\D/g, '');
            let uniqueKey = tipo + "_" + numericId;
            
            if (recordProcessati.has(uniqueKey)) return; // Se lo abbiamo già contato, lo saltiamo!
            recordProcessati.add(uniqueKey);

            let op = record.operatore || "CASSA / EXTRA";

            if (!window.datiOperatoriGlobale[op]) {
                window.datiOperatoriGlobale[op] = [];
            }
            
            if (statOperatori[op] === undefined) {
                statOperatori[op] = 0;
            }

            if (tipo === "VENDITA") {
                totVendite += record.totale || 0;
                totContanti += record.contanti || 0;
                totPos += record.pos || 0;
                numScontrini++;

                statOperatori[op] += (record.totale || 0);
                
                let metodoTesto = "";
                if (record.contanti > 0 && record.pos === 0) metodoTesto = " 💵 (Contanti)";
                else if (record.pos > 0 && record.contanti === 0) metodoTesto = " 💳 (POS)";
                else if (record.pos > 0 && record.contanti > 0) metodoTesto = " 💵💳 (Misto)";

                window.datiOperatoriGlobale[op].push({
                    ora: record.ora || "-",
                    tipo: "VENDITA",
                    importo: record.totale || 0,
                    desc: "Scontrino Emesso" + metodoTesto
                });

                if (record.articoli) {
                    record.articoli.forEach(art => {
                        let nome = art.DESCRIZIONE || art.descrizione || "Ignoto";
                        let qta = art.QUANTITA || art.qta || 1;
                        statProdotti[nome] = (statProdotti[nome] || 0) + qta;
                    });
                }
            } else if (tipo === "ENTRATA") {
                let valoreEntrata = record.totale || record.importo || 0;
                totEntrateExtra += valoreEntrata;
                
                statOperatori[op] += valoreEntrata;
                
                window.datiOperatoriGlobale[op].push({
                    ora: record.ora || "-",
                    tipo: "ENTRATA",
                    importo: valoreEntrata,
                    desc: record.descrizione || record.causale || "Entrata Extra"
                });
            } else if (tipo === "USCITA") {
                let valoreUscita = record.totale || record.importo || 0;
                totUscite += valoreUscita;
                
                statOperatori[op] -= valoreUscita;
                
                window.datiOperatoriGlobale[op].push({
                    ora: record.ora || "-",
                    tipo: "USCITA",
                    importo: valoreUscita,
                    desc: record.descrizione || record.causale || "Spesa/Uscita"
                });
            }
        });
    }

    let totIncassoNetto = totContanti + totPos + totEntrateExtra - totUscite;

    document.getElementById('ui-totale').textContent = `€ ${totIncassoNetto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    document.getElementById('ui-contanti').textContent = `€ ${totContanti.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    document.getElementById('ui-pos').textContent = `€ ${totPos.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    document.getElementById('ui-scontrini').textContent = numScontrini;
    document.getElementById('ui-media').textContent = `€ ${numScontrini > 0 ? (totVendite/numScontrini).toLocaleString('it-IT', { minimumFractionDigits: 2 }) : "0,00"}`;
    document.getElementById('ui-entrate').textContent = `+ € ${totEntrateExtra.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
    document.getElementById('ui-uscite').textContent = `- € ${totUscite.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;

    let htmlOp = "";
    let arrOp = Object.keys(statOperatori).map(k => ({nome: k, incasso: statOperatori[k]}));
    arrOp.sort((a,b) => b.incasso - a.incasso);
    
    arrOp.forEach(o => { 
        if (o.nome === "CASSA / EXTRA" || o.nome === "Sconosciuto") return;
        
        htmlOp += `
        <div class="list-item" style="align-items: center;">
            <span>${o.nome}</span>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="color:var(--accent-purple); font-weight:bold;">€ ${o.incasso.toLocaleString('it-IT',{minimumFractionDigits:2})}</span>
                <button onclick="apriDettaglioOperatore('${o.nome}')" style="background: rgba(137, 87, 229, 0.2); border: 1px solid var(--accent-purple); color: #fff; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 1.4vh;" title="Vedi Movimenti">👁️</button>
            </div>
        </div>`; 
    });
    document.getElementById('lista-operatori').innerHTML = htmlOp || "<i>Nessuna vendita registrata</i>";

    let htmlProd = "";
    let arrProd = Object.keys(statProdotti).map(k => ({nome: k, qta: statProdotti[k]}));
    arrProd.sort((a,b) => b.qta - a.qta);
    arrProd.slice(0, 5).forEach((p, index) => { 
        htmlProd += `<div class="list-item"><span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:75%;">${index+1}. ${p.nome}</span><span style="color:var(--accent-gold); font-weight:bold;">${p.qta} pz</span></div>`; 
    });
    document.getElementById('lista-prodotti').innerHTML = htmlProd || "<i>Nessun prodotto venduto</i>";
}

// Nuova funzione per aprire il modale con la lista dei movimenti
window.apriDettaglioOperatore = function(nome) {
    document.getElementById('titolo-modale-operatore').textContent = `👤 MOVIMENTI: ${nome.toUpperCase()}`;
    let listaContainer = document.getElementById('lista-dettaglio-operatore');
    listaContainer.innerHTML = "";

    let movimenti = window.datiOperatoriGlobale[nome] || [];
    
    if (movimenti.length === 0) {
        listaContainer.innerHTML = "<div style='text-align:center; padding: 20px; color: #888;'>Nessun movimento registrato.</div>";
    } else {
        // Ordina cronologicamente
        movimenti.sort((a, b) => a.ora.localeCompare(b.ora));
        
        let html = "";
        movimenti.forEach(m => {
            let coloreValore = m.tipo === 'USCITA' ? '#ff4d4d' : (m.tipo === 'ENTRATA' ? '#00cc66' : '#fff');
            let segno = m.tipo === 'USCITA' ? '-' : '+';
            html += `
            <div style="display: grid; grid-template-columns: 1fr 2.5fr 1fr; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.1); font-size: 1.6vh; align-items: center;">
                <div style="text-align: center; color: #b3d9ff;">${m.ora}</div>
                <div style="text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${m.desc}">${m.desc}</div>
                <div style="text-align: right; color: ${coloreValore}; font-weight: bold;">${segno} € ${m.importo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</div>
            </div>`;
        });
        listaContainer.innerHTML = html;
    }
    
    document.getElementById('modal-dettaglio-operatore').style.display = 'flex';
};

function mostraAvviso(testo) { 
    document.getElementById('testo-avviso').textContent = testo; 
    document.getElementById('modal-avviso').style.display = 'flex'; 
}

// ==========================================
// 👆 GESTIONE SWIPE (NAVIGAZIONE GIORNI)
// ==========================================
let touchstartX = 0;
let touchendX = 0;

function handleSwipe() {
    // Swipe verso sinistra (Vai avanti di un giorno)
    if (touchendX < touchstartX - 70) {
        cambiaGiorno(1);
    }
    // Swipe verso destra (Vai indietro di un giorno)
    if (touchendX > touchstartX + 70) {
        cambiaGiorno(-1);
    }
}

document.addEventListener('touchstart', e => {
    touchstartX = e.changedTouches[0].screenX;
});

document.addEventListener('touchend', e => {
    touchendX = e.changedTouches[0].screenX;
    handleSwipe();
});

window.onload = () => {
    aggiornaEtichettaData();
    scaricaDatiLive();
    
    timerAutoRefresh = setInterval(() => {
        let oggi = new Date();
        if (dataOsservata.toDateString() === oggi.toDateString()) {
            scaricaDatiLive();
        }
    }, 30000); 
};
