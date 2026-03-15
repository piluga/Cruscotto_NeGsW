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
    dataOsservata.setDate(dataOsservata.getDate() + delta);
    aggiornaEtichettaData();
    scaricaDatiLive();
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
    const url = `${FIREBASE_URL}/vendite_live/${giornoStr}.json`;

    try {
        let response = await fetch(url);
        let data = await response.json();

        let totVendite = 0; let totContanti = 0; let totPos = 0; let numScontrini = 0;
        let totEntrateExtra = 0; let totUscite = 0;
        let statOperatori = {}; let statProdotti = {};
        
        // Resetta la memoria degli operatori per il giorno selezionato
        window.datiOperatoriGlobale = {};

        if (data) {
            let chiavi = Object.keys(data);

            chiavi.forEach(id => {
                let record = data[id];
                let tipo = record.tipo ? record.tipo : "VENDITA";
                let op = record.operatore || "Sconosciuto";

                // Prepara il cassetto per questo operatore
                if (!window.datiOperatoriGlobale[op]) {
                    window.datiOperatoriGlobale[op] = [];
                }

                if (tipo === "VENDITA") {
                    totVendite += record.totale || 0;
                    totContanti += record.contanti || 0;
                    totPos += record.pos || 0;
                    numScontrini++;

                    statOperatori[op] = (statOperatori[op] || 0) + (record.totale || 0);
                    
                    // Salva la vendita nel dettaglio operatore
                    window.datiOperatoriGlobale[op].push({
                        ora: record.ora || record.ORA || "-",
                        tipo: "VENDITA",
                        importo: record.totale || 0,
                        desc: "Scontrino Emesso"
                    });

                    if (record.articoli) {
                        record.articoli.forEach(art => {
                            let nome = art.DESCRIZIONE || "Ignoto";
                            let qta = art.QUANTITA || 1;
                            statProdotti[nome] = (statProdotti[nome] || 0) + qta;
                        });
                    }
                } else if (tipo === "ENTRATA") {
                    totEntrateExtra += record.totale || 0;
                    window.datiOperatoriGlobale[op].push({
                        ora: record.ora || record.ORA || "-",
                        tipo: "ENTRATA",
                        importo: record.totale || 0,
                        desc: record.descrizione || "Entrata Extra"
                    });
                } else if (tipo === "USCITA") {
                    totUscite += record.totale || 0;
                    window.datiOperatoriGlobale[op].push({
                        ora: record.ora || record.ORA || "-",
                        tipo: "USCITA",
                        importo: record.totale || 0,
                        desc: record.descrizione || "Spesa/Uscita"
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
        
        // Aggiunge il tasto "Occhio" accanto all'incasso
        arrOp.forEach(o => { 
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

    } catch (error) { console.error(error); }
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