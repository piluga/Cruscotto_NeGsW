// Script classico: puo mostrare istruzioni anche quando i moduli file:// sono bloccati.
(() => {
    const stato = document.getElementById('login-stato');
    if (location.protocol === 'file:') {
        document.getElementById('login-form').hidden = true;
        stato.textContent = 'Per aprire il cruscotto sul PC, chiudi questa scheda e fai doppio clic su Avvia Cruscotto.bat nella stessa cartella. Il file index.html non può avviare il login direttamente dal disco.';
        return;
    }
    const manifest = document.createElement('link');
    manifest.rel = 'manifest'; manifest.href = './manifest.json'; document.head.append(manifest);
    import('./app.js?v=sicurezza-1').catch(() => {
        stato.textContent = 'Impossibile caricare il cruscotto. Verifica che tutti i file siano presenti e riapri tramite Avvia Cruscotto.bat oppure dal sito aggiornato.';
    });
})();
