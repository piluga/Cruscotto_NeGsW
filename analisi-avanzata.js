// CRUSCOTTO_ANALISI_LAZY_V1 — modulo di sola lettura; mai caricato durante il login.
const n = v => (v == null || v === '' ? 0 : Number(v));
const txt = v => String(v ?? '');
const euro = v => v.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export function calcolaAnalisi(datiGiorno) {
    if (!Array.isArray(datiGiorno) || datiGiorno.length !== 3) throw new Error('Dati della giornata non disponibili.');
    const storico = datiGiorno[1];
    if (storico !== null && (typeof storico !== 'object' || Array.isArray(storico))) throw new Error('Formato storico vendite non valido.');
    const esito = { resiOperazioni: 0, resiPezzi: 0, valoreResi: 0,
        puntiAssegnati: 0, puntiRiscattati: 0, utilizzoBns: 0, utilizzoVou: 0,
        righeBns: 0, righeVou: 0, venditeAnalizzate: 0 };
    for (const v of Object.values(storico || {})) {
        if (!v || typeof v !== 'object') continue;
        esito.venditeAnalizzate++;
        const car = n(v.PUNTI_CARICATI), scar = n(v.PUNTI_SCARICATI);
        if (!Number.isFinite(car) || !Number.isFinite(scar)) throw new Error('Punti fidelity non validi nello storico.');
        esito.puntiAssegnati += car;
        esito.puntiRiscattati += scar;
        let resoPresente = false;
        for (const a of (v.ARTICOLI || [])) {
            const cod = txt(a.CODICE).toUpperCase();
            const cat = txt(a.CATEGORIA).toUpperCase();
            const imp = n(a.IMPORTO), qta = n(a.QUANTITA);
            if (!Number.isFinite(imp) || !Number.isFinite(qta)) throw new Error('Riga articolo non valida nello storico.');
            if (cod.startsWith('RES-') || cat === 'RESO') {
                resoPresente = true;
                esito.resiPezzi += Math.max(0, qta);
                esito.valoreResi += Math.max(0, -imp);
            } else if (cod.startsWith('BNS')) {
                esito.righeBns++;
                esito.utilizzoBns += Math.max(0, -imp);
            } else if (cod.startsWith('VOU')) {
                esito.righeVou++;
                esito.utilizzoVou += Math.max(0, -imp);
            }
        }
        if (resoPresente) esito.resiOperazioni++;
    }
    return esito;
}

export function renderAnalisi(contenitore, datiGiorno) {
    const d = calcolaAnalisi(datiGiorno);
    const campi = [
        ['Operazioni con reso', String(d.resiOperazioni)],
        ['Pezzi restituiti', String(d.resiPezzi)],
        ['Valore articoli resi', euro(d.valoreResi)],
        ['Punti assegnati', String(d.puntiAssegnati)],
        ['Punti riscattati', String(d.puntiRiscattati)],
        ['Righe bonus utilizzate', String(d.righeBns)],
        ['Valore righe BNS', euro(d.utilizzoBns)],
        ['Righe buoni VOU utilizzate', String(d.righeVou)],
        ['Valore righe VOU', euro(d.utilizzoVou)],
        ['Buoni emessi', 'N/D — richiede archivio vouchers']
    ];
    contenitore.replaceChildren();
    const griglia = document.createElement('div');
    griglia.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:10px;';
    for (const [titolo, valore] of campi) {
        const box = document.createElement('div');
        box.style.cssText = 'border:1px solid rgba(255,204,0,.25);border-radius:9px;padding:12px;background:rgba(255,255,255,.04);';
        const label = document.createElement('div');
        label.style.cssText = 'font-size:12px;opacity:.8;'; label.textContent = titolo;
        const strong = document.createElement('strong');
        strong.style.cssText = 'display:block;margin-top:7px;font-size:18px;overflow-wrap:anywhere;'; strong.textContent = valore;
        box.append(label, strong); griglia.append(box);
    }
    const nota = document.createElement('p');
    nota.style.cssText = 'font-size:12px;opacity:.8;margin:12px 0 0;line-height:1.5;';
    nota.textContent = `Analizzate ${d.venditeAnalizzate} vendite presenti nello storico sincronizzato. Valori BNS/VOU: importi delle righe scontrino, non riconciliazione dei saldi buoni. L'emissione buoni non è determinabile senza leggere l'archivio vouchers. Nessun valore modifica gli incassi V2.`;
    contenitore.append(griglia, nota);
}
