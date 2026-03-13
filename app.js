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

async function scaricaDatiLive() {
    if (!navigator.onLine) { mostraAvviso("Sei offline!"); return; }

    const giornoStr = getGiornoString(dataOsservata);
    const url = `${FIREBASE_URL}/vendite_live/${giornoStr}.json`;

    try {
        let response = await fetch(url);
        let data = await response.json();

        let totIncasso = 0; let totContanti = 0; let totPos = 0; let numScontrini = 0;
        let totEntrateExtra = 0; let totUscite = 0;
        let statOperatori = {}; let statProdotti = {};

        if (data) {
            let chiavi = Object.keys(data);

            chiavi.forEach(id => {
                let record = data[id];
                let tipo = record.tipo ? record.tipo : "VENDITA";

                if (tipo === "VENDITA") {
                    totIncasso += record.totale || 0;
                    totContanti += record.contanti || 0;
                    totPos += record.pos || 0;
                    numScontrini++;

                    let op = record.operatore || "Sconosciuto";
                    statOperatori[op] = (statOperatori[op] || 0) + (record.totale || 0);

                    if (record.articoli) {
                        record.articoli.forEach(art => {
                            let nome = art.DESCRIZIONE || "Ignoto";
                            let qta = art.QUANTITA || 1;
                            statProdotti[nome] = (statProdotti[nome] || 0) + qta;
                        });
                    }
                } else if (tipo === "ENTRATA") {
                    totEntrateExtra += record.totale || 0;
                } else if (tipo === "USCITA") {
                    totUscite += record.totale || 0;
                }
            });
        }

        document.getElementById('ui-totale').textContent = `€ ${totIncasso.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
        document.getElementById('ui-contanti').textContent = `€ ${totContanti.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
        document.getElementById('ui-pos').textContent = `€ ${totPos.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
        document.getElementById('ui-scontrini').textContent = numScontrini;
        document.getElementById('ui-media').textContent = `€ ${numScontrini > 0 ? (totIncasso/numScontrini).toLocaleString('it-IT', { minimumFractionDigits: 2 }) : "0,00"}`;
        
        document.getElementById('ui-entrate').textContent = `+ € ${totEntrateExtra.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
        document.getElementById('ui-uscite').textContent = `- € ${totUscite.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;

        let htmlOp = "";
        let arrOp = Object.keys(statOperatori).map(k => ({nome: k, incasso: statOperatori[k]}));
        arrOp.sort((a,b) => b.incasso - a.incasso);
        arrOp.forEach(o => { htmlOp += `<div class="list-item"><span>${o.nome}</span><span style="color:var(--accent-purple); font-weight:bold;">€ ${o.incasso.toLocaleString('it-IT',{minimumFractionDigits:2})}</span></div>`; });
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

function mostraAvviso(testo) { 
    document.getElementById('testo-avviso').textContent = testo; 
    document.getElementById('modal-avviso').style.display = 'flex'; 
}

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