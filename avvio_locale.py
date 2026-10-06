"""Avvio locale del solo cruscotto. Nessun accesso ai dati Firebase dal server."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parent
FILES = frozenset({
    'index.html', 'style.css', 'avvio.js', 'app.js', 'firebase-config.js',
    'firebase-client.js', 'dati.js', 'sw.js', 'manifest.json',
    'icone/dashboard192.png', 'icone/dashboard512.png',
})


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript; charset=utf-8',
                      '.html': 'text/html; charset=utf-8',
                      '.css': 'text/css; charset=utf-8', '.json': 'application/json'}

    def log_message(self, *_args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    def send_head(self):
        port = self.server.server_port
        if self.headers.get('Host', '').lower() not in {f'127.0.0.1:{port}', f'localhost:{port}'}:
            self.send_error(403, 'Host non consentito')
            return None
        origin = self.headers.get('Origin')
        if origin and origin not in {f'http://127.0.0.1:{port}', f'http://localhost:{port}'}:
            self.send_error(403, 'Origine non consentita')
            return None
        name = unquote(urlsplit(self.path).path)
        if name == '/':
            name = '/index.html'
        relative = name[1:]
        if relative not in FILES or not (ROOT / relative).resolve().is_relative_to(ROOT):
            self.send_error(404, 'Risorsa non disponibile')
            return None
        self.path = name
        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description='Avvia il cruscotto su localhost.')
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--no-browser', action='store_true', help='Solo per le verifiche automatiche')
    args = parser.parse_args()
    handler = partial(Handler, directory=str(ROOT))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    except OSError:
        if args.port != 8766:
            raise
        # Una porta occupata non autorizza a fermare il servizio che la usa.
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    url = f'http://127.0.0.1:{server.server_port}/index.html'
    print(f'Cruscotto: {url}', flush=True)
    print('Lascia aperta questa finestra durante l\'uso. Per fermare il server premi Ctrl+C.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
