// Cruscotto 1.0.0 — aggregazione compatibile con Essenziale 2.1.9.
// Tutti gli importi monetari sono elaborati in centesimi.
const centesimi = value => {
    if (value == null || value === '') return 0;
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)))
        throw new Error('Importo non valido nei dati ricevuti.');
    const n = Number(value);
    if (Math.abs(n) > Number.MAX_SAFE_INTEGER / 100) throw new Error('Importo fuori intervallo.');
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100);
};
const numero = value => {
    if (value == null || value === '') return 0;
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)))
        throw new Error('Quantità non valida nei dati ricevuti.');
    return Number(value);
};
const testo = value => String(value ?? '');
function voci(value) {
    if (value === null) return [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Archivio ricevuto non valido.');
    return Object.entries(value);
}
const isServizio = articolo => {
    const codice = testo(articolo.CODICE ?? articolo.codice).toUpperCase();
    const categoria = testo(articolo.CATEGORIA ?? articolo.categoria).toUpperCase();
    return codice === 'PUNTI' || codice.startsWith('BNS') || codice.startsWith('VOU') ||
        codice.startsWith('RES-') || categoria === 'VOUCHER' || categoria === 'RESO' ||
        Boolean(articolo.is_giftcard_uso);
};
export function riepiloga([live, vendite, movimenti]) {
    const records = new Map();
    function aggiungi(key, r, fonte) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('Movimento ricevuto non valido.');
        const tipo = fonte === 'vendite' ? 'VENDITA' : (r.tipo || 'VENDITA');
        if (!['VENDITA', 'ENTRATA', 'USCITA'].includes(tipo)) throw new Error('Tipo di movimento non riconosciuto.');
        const contanti = centesimi(r.CONTANTI ?? r.contanti), pos = centesimi(r.POS ?? r.pos);
        let id = testo(r.id ?? key);
        if (tipo !== 'VENDITA' && fonte === 'live' && id.startsWith('MOV_')) id = id.slice(4);
        const totale = tipo === 'VENDITA' ? contanti + pos : centesimi(r.importo ?? r.totale);
        const articoli = r.ARTICOLI ?? r.articoli ?? [];
        if (!Array.isArray(articoli)) throw new Error('Articoli ricevuti non validi.');
        records.set(tipo + ':' + id, { tipo, contanti, pos, totale, articoli,
            operatore: testo(r.OPERATORE ?? r.operatore ?? 'Sconosciuto'),
            ora: testo(r.ORA ?? r.ora ?? '-'), desc: testo(r.descrizione ?? r.causale ?? (tipo === 'ENTRATA' ? 'Entrata Extra' : 'Spesa/Uscita')) });
    }
    for (const [key, r] of voci(live)) aggiungi(key, r, 'live');
    for (const [key, r] of voci(vendite)) aggiungi(key, r, 'vendite');
    for (const [key, r] of voci(movimenti)) aggiungi(key, r, 'movimenti');
    const out = { contanti: 0, pos: 0, scontrini: 0, entrate: 0, uscite: 0, operatori: new Map(), prodotti: new Map(), prodottiPerCodice: new Map(), bonusUtilizzati: 0, voucherUtilizzati: 0, liveSenzaArticoli: 0 };
    let contanti = 0, pos = 0, entrate = 0, uscite = 0, bonus = 0, voucher = 0;
    const importo = cents => cents / 100;
    for (const r of records.values()) {
        if (!out.operatori.has(r.operatore)) out.operatori.set(r.operatore, { totale: 0, movimenti: [], vendite: 0, entrate: 0, uscite: 0 });
        const op = out.operatori.get(r.operatore);
        if (r.tipo === 'VENDITA') {
            contanti += r.contanti; pos += r.pos; out.scontrini++;
            op.vendite += importo(r.totale);
            r.desc = 'Scontrino Emesso' + (r.contanti > 0 && r.pos > 0 ? ' (Misto)' : r.pos > 0 ? ' (POS)' : ' (Contanti)');
            if (!r.articoli.length) out.liveSenzaArticoli++;
            for (const art of r.articoli) {
                if (!art || typeof art !== 'object' || Array.isArray(art)) throw new Error('Articolo non valido.');
                const codice = testo(art.CODICE ?? art.codice), nome = testo(art.DESCRIZIONE ?? art.descrizione ?? 'Ignoto');
                const qta = numero(art.QUANTITA ?? art.qta ?? 1);
                if (codice.toUpperCase().startsWith('BNS')) bonus += Math.abs(centesimi(art.IMPORTO ?? art.importo));
                else if (testo(art.CATEGORIA ?? art.categoria).toUpperCase() === 'VOUCHER' && !codice.toUpperCase().startsWith('RES-')) voucher += Math.abs(centesimi(art.IMPORTO ?? art.importo));
                if (isServizio(art) || qta <= 0 || centesimi(art.IMPORTO ?? art.importo) <= 0) continue;
                const chiaveProdotto = codice || nome;
                const p = out.prodottiPerCodice.get(chiaveProdotto) ?? { codice, nome, quantita: 0 };
                p.quantita += qta;
                out.prodottiPerCodice.set(chiaveProdotto, p);
            }
        } else if (r.tipo === 'ENTRATA') { entrate += r.totale; op.entrate += importo(r.totale); }
        else { uscite += r.totale; op.uscite += importo(r.totale); }
        const netto = r.tipo === 'USCITA' ? -r.totale : r.totale;
        op.totale += importo(netto);
        op.movimenti.push({ ...r, contanti: importo(r.contanti), pos: importo(r.pos), totale: importo(r.totale) });
    }
    out.contanti = importo(contanti); out.pos = importo(pos);
    out.entrate = importo(entrate); out.uscite = importo(uscite);
    out.totale = importo(contanti + pos + entrate - uscite);
    out.media = out.scontrini ? importo(Math.round((contanti + pos) / out.scontrini)) : 0;
    out.bonusUtilizzati = importo(bonus); out.voucherUtilizzati = importo(voucher);
    // Compatibilità con l'interfaccia 1.0.0: la graduatoria usa ancora [nome, quantità].
    // Nomi duplicati sono disambiguati dal codice, senza mescolare prodotti diversi.
    for (const p of out.prodottiPerCodice.values()) {
        const omonimi = [...out.prodottiPerCodice.values()].filter(x => x.nome === p.nome).length > 1;
        out.prodotti.set(omonimi && p.codice ? `${p.nome} (${p.codice})` : p.nome, p.quantita);
    }
    return out;
}
