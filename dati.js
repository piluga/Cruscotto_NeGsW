const numero = value => {
    if (value == null || value === '') return 0;
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error('Importo o quantità non validi nei dati ricevuti.');
    return Number(value);
};
const testo = value => String(value ?? '');
function voci(value) {
    if (value === null) return [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Archivio ricevuto non valido.');
    return Object.entries(value);
}
export function riepiloga([live, vendite, movimenti]) {
    const records = new Map();
    function aggiungi(key, r, fonte) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('Movimento ricevuto non valido.');
        const tipo = fonte === 'vendite' ? 'VENDITA' : (r.tipo || 'VENDITA');
        if (!['VENDITA', 'ENTRATA', 'USCITA'].includes(tipo)) throw new Error('Tipo di movimento non riconosciuto.');
        const contanti = numero(r.CONTANTI ?? r.contanti), pos = numero(r.POS ?? r.pos);
        // La cassa usa MOV_<id> nel live e <id> nello storico. Non eliminare lettere dagli UUID.
        let id = testo(r.id ?? key);
        if (tipo !== 'VENDITA' && fonte === 'live' && id.startsWith('MOV_')) id = id.slice(4);
        const totale = tipo === 'VENDITA' ? contanti + pos : numero(r.importo ?? r.totale);
        const articoli = r.ARTICOLI ?? r.articoli ?? [];
        if (!Array.isArray(articoli)) throw new Error('Articoli ricevuti non validi.');
        records.set(tipo + ':' + id, { tipo, contanti, pos, totale, articoli,
            operatore: testo(r.OPERATORE ?? r.operatore ?? 'Sconosciuto'),
            ora: testo(r.ORA ?? r.ora ?? '-'), desc: testo(r.descrizione ?? r.causale ?? (tipo === 'ENTRATA' ? 'Entrata Extra' : 'Spesa/Uscita')) });
    }
    for (const [key, r] of voci(live)) aggiungi(key, r, 'live');
    for (const [key, r] of voci(vendite)) aggiungi(key, r, 'vendite');
    for (const [key, r] of voci(movimenti)) aggiungi(key, r, 'movimenti');
    const out = { contanti: 0, pos: 0, scontrini: 0, entrate: 0, uscite: 0, operatori: new Map(), prodotti: new Map() };
    for (const r of records.values()) {
        if (!out.operatori.has(r.operatore)) out.operatori.set(r.operatore, { totale: 0, movimenti: [] });
        const op = out.operatori.get(r.operatore);
        if (r.tipo === 'VENDITA') {
            out.contanti += r.contanti; out.pos += r.pos; out.scontrini++;
            r.desc = 'Scontrino Emesso' + (r.contanti > 0 && r.pos > 0 ? ' (Misto)' : r.pos > 0 ? ' (POS)' : ' (Contanti)');
            for (const art of r.articoli) {
                if (!art || typeof art !== 'object') throw new Error('Articolo non valido.');
                const nome = testo(art.DESCRIZIONE ?? art.descrizione ?? 'Ignoto');
                out.prodotti.set(nome, (out.prodotti.get(nome) || 0) + numero(art.QUANTITA ?? art.qta ?? 1));
            }
        } else if (r.tipo === 'ENTRATA') out.entrate += r.totale;
        else out.uscite += r.totale;
        op.totale += r.tipo === 'USCITA' ? -r.totale : r.totale;
        op.movimenti.push(r);
    }
    out.totale = out.contanti + out.pos + out.entrate - out.uscite;
    out.media = out.scontrini ? (out.contanti + out.pos) / out.scontrini : 0;
    return out;
}
