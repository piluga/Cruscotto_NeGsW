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
    // CRUSCOTTO_STATISTICHE_RESI_V2
    // Totale monetario invariato; media e conteggio scontrini escludono resi/buoni puri.
    const out = { contanti: 0, pos: 0, scontrini: 0, entrate: 0, uscite: 0, operatori: new Map(), prodotti: new Map() };
    const nonMerce = art => {
        const codice = testo(art.CODICE ?? art.codice).toUpperCase();
        const categoria = testo(art.CATEGORIA ?? art.categoria).toUpperCase();
        return codice === 'PUNTI' || /^(RES-|BNS|VOU)/.test(codice) ||
            ['RESO', 'VOUCHER', 'GIFT_CARD_USO', 'GIFT_CARD_RICARICA'].includes(categoria);
    };
    let incassoScontrini = 0;
    for (const r of records.values()) {
        if (!out.operatori.has(r.operatore)) out.operatori.set(r.operatore, { totale: 0, movimenti: [] });
        const op = out.operatori.get(r.operatore);
        if (r.tipo === 'VENDITA') {
            out.contanti += r.contanti; out.pos += r.pos;
            const merce = [];
            let contieneReso = false;
            for (const art of r.articoli) {
                if (!art || typeof art !== 'object' || Array.isArray(art)) throw new Error('Articolo non valido.');
                const importo = numero(art.IMPORTO ?? (art.prezzo != null ? numero(art.prezzo) * numero(art.qta ?? 1) : null));
                const codice = testo(art.CODICE ?? art.codice).toUpperCase();
                const categoria = testo(art.CATEGORIA ?? art.categoria).toUpperCase();
                if (codice.startsWith('RES-') || categoria === 'RESO') contieneReso = true;
                if (!nonMerce(art) && importo > 0) merce.push(art);
            }
            // La riga live non contiene il dettaglio articoli: in assenza dello storico
            // viene trattata provvisoriamente come normale vendita, senza inventare resi.
            const venditaCommerciale = r.articoli.length === 0 || merce.length > 0;
            if (venditaCommerciale) { out.scontrini++; incassoScontrini += r.contanti + r.pos; }
            r.desc = !venditaCommerciale && contieneReso ? 'Reso / buono emesso' :
                !venditaCommerciale ? 'Operazione senza merce' :
                contieneReso ? 'Vendita con reso' : 'Scontrino Emesso' +
                (r.contanti > 0 && r.pos > 0 ? ' (Misto)' : r.pos > 0 ? ' (POS)' : ' (Contanti)');
            for (const art of merce) {
                const nome = testo(art.DESCRIZIONE ?? art.descrizione ?? 'Ignoto');
                const qta = numero(art.QUANTITA ?? art.qta ?? 1);
                if (qta <= 0) continue;
                out.prodotti.set(nome, (out.prodotti.get(nome) || 0) + qta);
            }
        } else if (r.tipo === 'ENTRATA') out.entrate += r.totale;
        else out.uscite += r.totale;
        // Incassi per operatore = movimenti monetari; buoni emessi non sono denaro incassato.
        op.totale += r.tipo === 'USCITA' ? -r.totale : r.totale;
        op.movimenti.push(r);
    }
    out.totale = out.contanti + out.pos + out.entrate - out.uscite;
    out.media = out.scontrini ? incassoScontrini / out.scontrini : 0;
    return out;
}
