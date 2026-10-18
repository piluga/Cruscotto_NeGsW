export class ErroreFirebase extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

// Token solo in memoria: nessuna password/sessione salvata su disco o nella PWA.
export function creaClient(config, { fetchImpl = globalThis.fetch.bind(globalThis), now = Date.now, timeout = 15000 } = {}) {
    let sessione = null, generazione = 0, rinnovo = null;
    const pendenti = new Set();
    // CRUSCOTTO_PERSIST_V1: refresh token sul dispositivo soltanto con opt-in.
    // localStorage non e cifrato: attivare solo su dispositivo personale e protetto.
    const STORAGE = 'cruscotto_refresh_session_v1__a__' + String(config.projectId);
    let ricordaSessione = false, emailSessione = '';
    const leggiPersistenza = () => { try { return JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch { return null; } };
    const eliminaPersistenza = () => { try { localStorage.removeItem(STORAGE); } catch {} };
    function memorizza() {
        if (!ricordaSessione || !sessione) return;
        try { localStorage.setItem(STORAGE, JSON.stringify({ uid: sessione.uid, refreshToken: sessione.refreshToken, email: emailSessione })); }
        catch { /* Storage negato: login resta valido per la scheda aperta. */ }
    }
    const configurato = (() => {
        try {
            const url = new URL(config.databaseURL);
            return Boolean(config.apiKey?.trim()) && url.protocol === 'https:' &&
                /\.(firebasedatabase\.app|firebaseio\.com)$/.test(url.hostname) &&
                !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
        } catch { return false; }
    })();
    const erroreSessione = () => new ErroreFirebase('SESSIONE', 'Sessione terminata. Accedi nuovamente.');
    function esci() {
        ricordaSessione = false; emailSessione = ""; eliminaPersistenza();
        generazione++; sessione = null; rinnovo = null;
        pendenti.forEach(controller => controller.abort()); pendenti.clear();
    }
    async function richiesta(url, init = {}, signal) {
        const controller = new AbortController();
        pendenti.add(controller);
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        const timer = setTimeout(abort, timeout);
        try {
            const response = await fetchImpl(url, { ...init, signal: controller.signal,
                cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
            let data;
            try { data = await response.json(); }
            catch (error) {
                if (controller.signal.aborted) throw error;
                throw new ErroreFirebase('RISPOSTA', 'Risposta del servizio non valida. Riprova.');
            }
            if (!response.ok || data?.error) {
                const code = data?.error?.message || '';
                if (/INVALID_LOGIN_CREDENTIALS|EMAIL_NOT_FOUND|INVALID_PASSWORD|INVALID_EMAIL/.test(code))
                    throw new ErroreFirebase('CREDENZIALI', 'Email o password non valide.');
                if (/TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_DISABLED|USER_NOT_FOUND|INVALID_ID_TOKEN/.test(code))
                    throw erroreSessione();
                if (response.status === 429 || /TOO_MANY_ATTEMPTS/.test(code))
                    throw new ErroreFirebase('LIMITE', 'Troppi tentativi. Attendi prima di riprovare.');
                if (response.status === 401 || response.status === 403)
                    throw new ErroreFirebase('PERMESSI', 'Accesso ai dati non autorizzato. Verifica i permessi dell’account.');
                if (/OPERATION_NOT_ALLOWED|API_KEY_INVALID|PROJECT_NOT_FOUND/.test(code))
                    throw new ErroreFirebase('CONFIG', 'Accesso Firebase non configurato. Contatta chi gestisce l’app.');
                throw new ErroreFirebase('SERVIZIO', 'Servizio non disponibile. Riprova più tardi.');
            }
            return data;
        } catch (error) {
            if (error instanceof ErroreFirebase) throw error;
            if (signal?.aborted) throw new DOMException('Richiesta annullata', 'AbortError');
            throw new ErroreFirebase('RETE', 'Collegamento non disponibile o scaduto. Controlla la connessione e riprova.');
        } finally {
            clearTimeout(timer); pendenti.delete(controller); signal?.removeEventListener('abort', abort);
        }
    }
    function salva(data, gen, refresh = false) {
        if (generazione !== gen) throw erroreSessione();
        const idToken = refresh ? data.id_token : data.idToken;
        const refreshToken = refresh ? data.refresh_token : data.refreshToken;
        const uid = refresh ? data.user_id : data.localId;
        const durata = Number(refresh ? data.expires_in : data.expiresIn);
        if (!idToken || !refreshToken || !uid || !Number.isFinite(durata) || durata <= 0)
            throw new ErroreFirebase('RISPOSTA', 'Sessione Firebase non valida.');
        if (refresh && uid !== sessione?.uid) throw erroreSessione();
        sessione = { idToken, refreshToken, uid, expiresAt: now() + durata * 1000 };
        memorizza();
    }
    async function accedi(email, password, persistente = false) {
        esci();
        if (!configurato) throw new ErroreFirebase('CONFIG', 'Configurazione Firebase da completare.');
        const gen = generazione;
        const data = await richiesta('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(config.apiKey), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true })
        });
        ricordaSessione = Boolean(persistente);
        emailSessione = email.trim();
        salva(data, gen);
        return { uid: sessione.uid };
    }
    async function token() {
        if (!sessione) throw erroreSessione();
        if (now() < sessione.expiresAt - 60000) return sessione.idToken;
        if (!rinnovo) {
            const gen = generazione;
            rinnovo = (async () => {
                try {
                    const data = await richiesta('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(config.apiKey), {
                        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: sessione.refreshToken }).toString()
                    });
                    salva(data, gen, true);
                } catch (error) {
                    if (error.code === 'SESSIONE' && gen === generazione) esci();
                    throw error;
                } finally { if (gen === generazione) rinnovo = null; }
            })();
        }
        await rinnovo;
        if (!sessione) throw erroreSessione();
        return sessione.idToken;
    }
    async function leggiGiorno(giorno, { signal } = {}) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) throw new Error('Data non valida');
        const gen = generazione;
        const idToken = await token();
        if (gen !== generazione) throw erroreSessione();
        const leggi = (path, campo) => {
            const url = new URL(path + '.json', new URL('/', config.databaseURL));
            url.searchParams.set('auth', idToken);
            if (campo) { url.searchParams.set('orderBy', JSON.stringify(campo)); url.searchParams.set('equalTo', JSON.stringify(giorno)); }
            return richiesta(url.href, {}, signal);
        };
        // Nessun totale parziale se uno dei tre archivi non è disponibile.
        const dati = await Promise.all([leggi('vendite_live/' + giorno), leggi('storico_vendite', 'GIORNO'), leggi('storico_movimenti', 'data')]);
        if (gen !== generazione) throw erroreSessione();
        return dati;
    }
    // CRUSCOTTO_LEGGI_ANDAMENTO_V1: due query indicizzate + eventuale live odierno. Solo GET autenticati.
    async function leggiIntervallo(dal, al, { signal } = {}) {
        const schema = /^\d{4}-\d{2}-\d{2}$/;
        const parse = s => { const [y,m,d] = s.split('-').map(Number); const dt = new Date(Date.UTC(y,m-1,d)); return dt.toISOString().slice(0,10) === s ? dt : null; };
        if (!schema.test(dal) || !schema.test(al) || !parse(dal) || !parse(al)) throw new Error('Date del periodo non valide.');
        const giorni = (parse(al) - parse(dal)) / 86400000;
        if (giorni < 0 || giorni > 64) throw new Error('Intervallo non consentito: massimo 65 giorni.');
        const gen = generazione;
        const idToken = await token();
        if (gen !== generazione) throw erroreSessione();
        const range = (archivio, campo) => {
            const url = new URL(archivio + '.json', new URL('/', config.databaseURL));
            url.searchParams.set('auth', idToken);
            url.searchParams.set('orderBy', JSON.stringify(campo));
            url.searchParams.set('startAt', JSON.stringify(dal));
            url.searchParams.set('endAt', JSON.stringify(al));
            return richiesta(url.href, {}, signal);
        };
        const oggi = new Date();
        const local = `${oggi.getFullYear()}-${String(oggi.getMonth()+1).padStart(2,'0')}-${String(oggi.getDate()).padStart(2,'0')}`;
        const live = (dal <= local && local <= al) ? (() => {
            const url = new URL('vendite_live/' + local + '.json', new URL('/', config.databaseURL));
            url.searchParams.set('auth', idToken);
            return richiesta(url.href, {}, signal);
        })() : Promise.resolve(null);
        // Nessun dato parziale: se manca una lettura, il pannello segnala l'errore.
        const dati = await Promise.all([live, range('storico_vendite', 'GIORNO'), range('storico_movimenti', 'data')]);
        if (gen !== generazione) throw erroreSessione();
        return dati;
    }
    async function ripristina() {
        const salvata = leggiPersistenza();
        if (!salvata || !salvata.uid || !salvata.refreshToken || !salvata.email || !configurato) return null;
        // Non sovrascrivere una sessione gia autenticata.
        if (sessione) return { uid: sessione.uid, email: emailSessione };
        ricordaSessione = true;
        emailSessione = salvata.email;
        sessione = { uid: salvata.uid, refreshToken: salvata.refreshToken, idToken: '', expiresAt: 0 };
        try { await token(); return { uid: sessione.uid, email: emailSessione }; }
        catch { esci(); return null; }
    }    return { configurato, accedi, esci, ripristina, leggiGiorno, leggiIntervallo, get autenticato() { return Boolean(sessione); } };
}
