const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const database = 'https://fidelity-gestionale-default-rtdb.europe-west1.firebasedatabase.app';
async function ambiente(t, workers = 'block') {
    const server = http.createServer((req, res) => {
        const relative = new URL(req.url, 'http://test').pathname;
        const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html', '.png': 'image/png' }[path.extname(file)] || 'text/plain');
        res.end(relative === '/firebase-config.js' ? `export const firebaseConfig = {apiKey:'fixture-key',databaseURL:'${database}'};` : fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext({ serviceWorkers: workers });
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage();
    return { context, page, origin };
}
test('login reale, dati sicuri, errori espliciti, cambio data e logout', async t => {
    const { context, page, origin } = await ambiente(t);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let reads = 0, denied = false, empty = false, slow = false;
    let resolveSlow; const slowStarted = new Promise(resolve => resolveSlow = resolve);
    const operatore = `O'Neil <img src=x data-injected>`, prodotto = '<b data-injected>Profumo</b>';
    await context.route('https://identitytoolkit.googleapis.com/**', route => route.fulfill({ json: { localId: 'uid-test', idToken: 'fixture-token', refreshToken: 'fixture-refresh', expiresIn: '3600' } }));
    await context.route(database + '/**', async route => {
        reads++; const url = new URL(route.request().url());
        assert.equal(url.searchParams.get('auth'), 'fixture-token'); assert.equal(route.request().method(), 'GET');
        if (slow) { resolveSlow(); await new Promise(resolve => setTimeout(resolve, 500)); }
        if (denied && url.pathname.includes('storico_vendite')) return route.fulfill({ status: 401, json: { error: 'Permission denied' } });
        const record = { id: 'abc-12', GIORNO: '2026-10-01', ORA: '12:00', OPERATORE: operatore, CONTANTI: 12, POS: 8,
            ARTICOLI: [{ CODICE: 'P1', DESCRIZIONE: prodotto, QUANTITA: 1, IMPORTO: 20 }] };
        await route.fulfill({ json: !empty && url.pathname.includes('storico_vendite') ? { 'abc-12': record } : null });
    });
    await page.goto(origin);
    await page.locator('#btn-accedi:enabled').waitFor(); assert.equal(reads, 0);
    assert.equal(await page.locator('#main-container').isVisible(), false);
    assert.equal(await page.locator('[onclick]').count(), 0);
    await page.locator('#login-email').fill('test@example.invalid'); await page.locator('#login-password').fill('password-fixture');
    await page.locator('#btn-accedi').click(); await page.waitForFunction(() => document.getElementById('ui-scontrini').textContent === '1');
    assert.match(await page.locator('#ui-totale').innerText(), /20,00/);
    assert.equal(await page.locator('[data-injected]').count(), 0);
    assert.ok((await page.locator('#lista-operatori').textContent()).includes(operatore));
    await page.getByRole('button', { name: 'Dettagli', exact: true }).click();
    assert.ok((await page.locator('#titolo-modale-operatore').textContent()).includes(operatore));
    await page.locator('#chiudi-dettaglio').click();
    assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), globals: typeof window.datiOperatoriGlobale })), { local: [], session: [], globals: 'undefined' });
    denied = true; await page.locator('#btn-manuale').click();
    await page.waitForFunction(() => document.getElementById('stato-dati').textContent.includes('non autorizzato'));
    assert.equal(await page.locator('#ui-totale').textContent(), '—');
    denied = false; empty = true; await page.locator('#btn-manuale').click();
    await page.waitForFunction(() => document.getElementById('stato-dati').textContent.includes('Nessun movimento'));
    assert.match(await page.locator('#ui-totale').innerText(), /0,00/);
    // Una risposta del giorno precedente non deve sovrascrivere la selezione nuova.
    slow = true; empty = false; await page.locator('#btn-manuale').click(); await slowStarted;
    slow = false; empty = true; await page.locator('#giorno-prima').click();
    await page.waitForFunction(() => document.getElementById('stato-dati').textContent.includes('Nessun movimento'));
    await page.waitForTimeout(600); assert.equal(await page.locator('#ui-scontrini').textContent(), '0');
    await page.locator('#btn-esci').click();
    assert.equal(await page.locator('#main-container').isVisible(), false);
    assert.equal(await page.locator('#ui-totale').textContent(), '—'); assert.equal(await page.locator('#lista-operatori').textContent(), '');
    const after = reads; await page.waitForTimeout(100); assert.equal(reads, after);
    assert.deepEqual(errors, []);
});
test('PWA: sostituisce cache legacy, conserva cache estranee e non conserva dati o token', async t => {
    const { context, page, origin } = await ambiente(t, 'allow');
    await page.goto(origin + '/manifest.json');
    await page.evaluate(async origin => {
        const old = await caches.open('cruscotto-v50'); await old.put(origin + '/app.js', new Response('vecchio'));
        const other = await caches.open('altra-app'); await other.put(origin + '/sentinella', new Response('conservare'));
    }, origin);
    await page.goto(origin);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    assert.deepEqual((await page.evaluate(() => caches.keys())).sort(), ['altra-app', 'cruscotto-sicurezza-v3']);
    const cached = await page.evaluate(async () => (await (await caches.open('cruscotto-sicurezza-v3')).keys()).map(r => r.url));
    assert.ok(cached.every(url => url.startsWith(origin) && !url.includes('auth=')));
    await context.setOffline(true); await page.reload();
    await page.locator('#login-panel').waitFor();
    assert.equal(await page.locator('#main-container').isVisible(), false);
});
