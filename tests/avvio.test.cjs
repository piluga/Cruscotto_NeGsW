const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');

test('avvio da file e server locale reale: istruzioni o login attivo, nessun accesso Firebase', {timeout: 60000}, async t => {
    const server = spawn('python', ['-B', path.join(root, 'avvio_locale.py'), '--no-browser', '--port', '0']);
    const stopped = once(server, 'exit');
    t.after(async () => { if (server.exitCode === null) server.kill(); await stopped; });
    const url = await new Promise((resolve, reject) => {
        let text = '';
        const timer = setTimeout(() => reject(new Error('Avvio server scaduto')), 10000);
        server.stdout.on('data', chunk => { text += chunk; const match = text.match(/Cruscotto: (http:\/\/[^\s]+)/); if (match) {clearTimeout(timer); resolve(match[1]);} });
        server.once('error', e => {clearTimeout(timer); reject(e);});
        server.once('exit', code => {clearTimeout(timer); reject(new Error('Server terminato: ' + code));});
    });
    const origin = new URL(url).origin;
    const script = await fetch(origin + '/app.js?v=sicurezza-1');
    assert.equal(script.status, 200); assert.match(script.headers.get('content-type'), /javascript/);
    for (const resource of ['/firebase/cruscotto.rules.example.json', '/avvio_locale.py', '/tests/', '/SICUREZZA_FIREBASE.md'])
        assert.equal((await fetch(origin + resource)).status, 404);
    assert.equal((await fetch(url, {headers:{Origin:'https://estraneo.invalid'}})).status, 403);
    const browser = await chromium.launch({channel:'chrome',headless:true});
    t.after(() => browser.close());
    const context = await browser.newContext({serviceWorkers:'block'});
    let remote = 0;
    await context.route('**/*', route => {
        if (route.request().url().startsWith(origin) || route.request().url().startsWith('file:')) return route.continue();
        remote++; return route.abort();
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForFunction(() => document.getElementById('login-stato').textContent.includes('Avvia Cruscotto.bat'));
    assert.equal(await page.locator('#login-form').isVisible(), false);
    await page.goto(url);
    await page.locator('#btn-accedi:enabled').waitFor();
    await page.locator('#login-email').fill('prova@example.invalid');
    assert.equal(await page.locator('#login-email').inputValue(), 'prova@example.invalid');
    assert.equal(await page.locator('#login-email').getAttribute('autocomplete'), 'username');
    assert.equal(await page.locator('#login-password').getAttribute('autocomplete'), 'current-password');
    assert.equal(remote, 0); assert.deepEqual(errors, []);
});
