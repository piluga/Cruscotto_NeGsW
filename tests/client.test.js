import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaClient } from '../firebase-client.js';
import { riepiloga } from '../dati.js';
const config = { apiKey: 'fixture-key', databaseURL: 'https://fixture-default-rtdb.europe-west1.firebasedatabase.app' };
const login = { localId: 'uid-test', idToken: 'id-fixture', refreshToken: 'refresh-fixture', expiresIn: '3600' };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
test('nessun accesso anonimo, configurazione mancante bloccata', async () => {
    let calls = 0;
    const c = creaClient(config, { fetchImpl: async () => { calls++; } });
    await assert.rejects(c.leggiGiorno('2026-10-01'), { code: 'SESSIONE' });
    const vuoto = creaClient({ ...config, apiKey: '' });
    await assert.rejects(vuoto.accedi('a@b.it', 'test'), { code: 'CONFIG' });
    assert.equal(calls, 0);
});
test('login, letture solo GET con token, rinnovo unico per richieste simultanee', async () => {
    let now = 0, refreshes = 0, reads = [];
    const c = creaClient(config, { now: () => now, fetchImpl: async (url, init) => {
        if (url.includes('signInWithPassword')) return response(login);
        if (url.includes('securetoken')) { refreshes++; assert.match(init.body, /refresh_token=refresh-fixture/); return response({ user_id: login.localId, id_token: 'nuovo', refresh_token: 'nuovo-refresh', expires_in: 3600 }); }
        reads.push({ url: new URL(url), method: init.method }); return response(null);
    } });
    await c.accedi('a@b.it', 'password-fixture');
    await c.leggiGiorno('2026-10-01');
    assert.ok(reads.every(r => r.url.searchParams.get('auth') === 'id-fixture' && !r.method));
    assert.equal(reads[1].url.searchParams.get('equalTo'), '"2026-10-01"');
    now = 3600000; reads = [];
    await Promise.all([c.leggiGiorno('2026-10-01'), c.leggiGiorno('2026-10-01')]);
    assert.equal(refreshes, 1); assert.ok(reads.every(r => r.url.searchParams.get('auth') === 'nuovo'));
    c.esci(); await assert.rejects(c.leggiGiorno('2026-10-01'), { code: 'SESSIONE' });
});
test('permessi negati non diventano dati vuoti o parziali', async () => {
    const c = creaClient(config, { fetchImpl: async url => url.includes('signIn') ? response(login) : url.includes('storico_vendite') ? response({ error: 'Permission denied' }, 401) : response(null) });
    await c.accedi('a@b.it', 'fixture');
    await assert.rejects(c.leggiGiorno('2026-10-01'), { code: 'PERMESSI' });
});
test('logout durante login impedisce di riattivare la sessione con risposta tardiva', async () => {
    let resolve;
    const c = creaClient(config, { fetchImpl: () => new Promise(r => { resolve = r; }) });
    const pending = c.accedi('a@b.it', 'fixture'); c.esci(); resolve(response(login));
    await assert.rejects(pending, { code: 'SESSIONE' }); assert.equal(c.autenticato, false);
});
test('token revocato durante rinnovo termina la sessione', async () => {
    let now = 0;
    const c = creaClient(config, { now: () => now, fetchImpl: async url => url.includes('signIn') ? response(login) : response({ error: { message: 'INVALID_REFRESH_TOKEN' } }, 400) });
    await c.accedi('a@b.it', 'fixture'); now = 3600000;
    await assert.rejects(c.leggiGiorno('2026-10-01'), { code: 'SESSIONE' }); assert.equal(c.autenticato, false);
});
test('timeout limita anche la lettura della risposta', async () => {
    const c = creaClient(config, { timeout: 20, fetchImpl: async (_url, init) => ({ ok: true, json: () => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))) }) });
    await assert.rejects(c.accedi('a@b.it', 'fixture'), { code: 'RETE' });
});
test('deduplica live/storico senza unire UUID diversi o vendite e movimenti con stesso ID', () => {
    const d = riepiloga([
        { 'abc-12': { id: 'abc-12', contanti: 10 }, 'def-12': { id: 'def-12', pos: 20 }, 'MOV_abc-12': { id: 'MOV_abc-12', tipo: 'USCITA', totale: 3 } },
        { 'abc-12': { id: 'abc-12', CONTANTI: '10', OPERATORE: '__proto__', ARTICOLI: [{ DESCRIZIONE: 'constructor', QUANTITA: 2 }] } },
        { 'abc-12': { id: 'abc-12', tipo: 'USCITA', importo: '3' } }
    ]);
    assert.equal(d.totale, 27); assert.equal(d.scontrini, 2); assert.equal(d.uscite, 3);
    assert.equal(d.prodotti.get('constructor'), 2); assert.equal(d.operatori.get('__proto__').totale, 10);
});
test('null significa nessun movimento; dati malformati sono un errore', () => {
    assert.equal(riepiloga([null, null, null]).totale, 0);
    assert.throws(() => riepiloga([{}, { a: { CONTANTI: 'non-numero' } }, {}]));
    assert.throws(() => riepiloga(['errore', {}, {}]));
});
