#!/usr/bin/env python3
"""Serve a verified, portable Scicon watch bundle using only Python's standard library.

Run ``python3 serve-watch.py`` beside checksums.json. No simulation or lab API is
loaded. Only the files named in that manifest and allowed media types are served.
"""
import argparse
import gzip
import hashlib
import json
import re
import socket
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
}
TEXT_SUFFIXES = {'.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md'}
BLOCK_SIZE = 65536
MAX_COMPRESSED_SOURCE = 16 * 1024 * 1024


def digest_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(BLOCK_SIZE), b''):
            digest.update(chunk)
    return digest.hexdigest()


def valid_relative_name(name):
    return (isinstance(name, str) and bool(name) and not name.startswith('/')
            and not any(char in name for char in ('\\', ':', '\x00'))
            and all(part not in ('', '.', '..') for part in name.split('/')))


def accepts_gzip(header):
    encodings = {}
    for entry in (header or '').split(','):
        parts = [part.strip().lower() for part in entry.split(';')]
        quality = 1.0
        for parameter in parts[1:]:
            if parameter.startswith('q='):
                try:
                    quality = float(parameter[2:])
                except ValueError:
                    quality = 0.0
        encodings[parts[0]] = 0 < quality <= 1
    return encodings.get('gzip', encodings.get('*', False))


def parse_range(header, size):
    if header is None:
        return 0, size - 1, False
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
    if not match or not any(match.groups()) or size <= 0:
        raise ValueError('Invalid byte range')
    first, last = match.groups()
    if not first:
        count = int(last)
        if count <= 0:
            raise ValueError('Invalid byte range')
        return max(0, size - count), size - 1, True
    start = int(first)
    end = min(int(last), size - 1) if last else size - 1
    if start >= size or end < start:
        raise ValueError('Unsatisfiable byte range')
    return start, end, True


@dataclass(frozen=True)
class PackageFile:
    path: Path
    sha256: str
    size: int
    mtime_ns: int
    mime: str
    compressed: bytes


class VerifiedPackage:
    def __init__(self, directory):
        self.root = Path(directory).resolve(strict=True)
        manifest = (self.root / 'checksums.json').resolve(strict=True)
        if not manifest.is_relative_to(self.root):
            raise ValueError('checksums.json must be inside the portable package')
        checksums = json.loads(manifest.read_text(encoding='utf-8'))
        if not isinstance(checksums, dict) or not checksums:
            raise ValueError('checksums.json must contain the package file hashes')
        self.files = {}
        self.verified_count = 0
        for name, expected in checksums.items():
            if not valid_relative_name(name) or not isinstance(expected, str) or not re.fullmatch(r'[a-fA-F0-9]{64}', expected):
                raise ValueError('Invalid checksums.json entry: ' + str(name))
            path = (self.root / name).resolve(strict=True)
            if not path.is_relative_to(self.root) or not path.is_file():
                raise ValueError('Package file is outside its directory: ' + name)
            before = path.stat()
            if digest_file(path) != expected.lower():
                raise ValueError('Package checksum mismatch: ' + name)
            after = path.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise ValueError('Package file changed while verifying: ' + name)
            self.verified_count += 1
            suffix = path.suffix.lower()
            # The server script may itself be checksummed, but is never exposed.
            if suffix not in MIME_TYPES:
                continue
            compressed = None
            if suffix in TEXT_SUFFIXES and 1024 <= after.st_size <= MAX_COMPRESSED_SOURCE:
                content = path.read_bytes()
                if hashlib.sha256(content).hexdigest() != expected.lower():
                    raise ValueError('Package file changed while preparing: ' + name)
                candidate = gzip.compress(content, compresslevel=6, mtime=0)
                if len(candidate) < len(content):
                    compressed = candidate
            self.files[name] = PackageFile(path, expected.lower(), after.st_size,
                                           after.st_mtime_ns, MIME_TYPES[suffix], compressed)
        if 'index.html' not in self.files:
            raise ValueError('The portable package must include a checksummed index.html')

    def find(self, name):
        if not valid_relative_name(name):
            return None
        entry = self.files.get(name)
        if entry is None:
            return None
        resolved = entry.path.resolve(strict=True)
        if not resolved.is_relative_to(self.root):
            raise ValueError('Package path changed; restart after restoring the verified files')
        stat = resolved.stat()
        if resolved != entry.path or (stat.st_size, stat.st_mtime_ns) != (entry.size, entry.mtime_ns):
            raise ValueError('Package file changed; restart after restoring the verified files')
        return entry


class WatchHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.0'

    def setup(self):
        super().setup()
        self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.connection.settimeout(30)

    def log_message(self, *args):
        pass

    def headers_for(self, status, length, mime='text/plain; charset=utf-8', extra=None):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(length))
        self.send_header('Connection', 'close')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.close_connection = True

    def message(self, status, text, extra=None):
        body = text.encode('utf-8')
        self.headers_for(status, len(body), extra=extra)
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_GET(self):
        try:
            host = self.headers.get('Host', '').split(':', 1)[0].lower()
            if host not in ('127.0.0.1', 'localhost'):
                return self.message(403, 'Loopback host required')
            url = urlsplit(self.path)
            if url.scheme or url.netloc:
                return self.message(400, 'Only local package paths are supported')
            path = unquote(url.path, encoding='utf-8', errors='strict')
            name = 'index.html' if path == '/' else path[1:] if path.startswith('/') else ''
            entry = self.server.package.find(name)
            if entry is None:
                return self.message(404, 'File is not part of this portable display')
            identity_etag = '"' + entry.sha256 + '"'
            range_header = self.headers.get('Range')
            if self.headers.get('If-Range') not in (None, identity_etag):
                range_header = None
            compressed = entry.compressed if range_header is None and accepts_gzip(self.headers.get('Accept-Encoding')) else None
            etag = '"' + entry.sha256 + ('-gzip' if compressed is not None else '') + '"'
            common = {'ETag': etag, 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes'}
            if entry.compressed is not None:
                common['Vary'] = 'Accept-Encoding'
            if self.headers.get('If-None-Match') in ('*', etag):
                return self.headers_for(304, 0, entry.mime, common)
            if compressed is not None:
                common['Content-Encoding'] = 'gzip'
                self.headers_for(200, len(compressed), entry.mime, common)
                if self.command != 'HEAD':
                    for offset in range(0, len(compressed), BLOCK_SIZE):
                        self.wfile.write(compressed[offset:offset + BLOCK_SIZE])
                    self.wfile.flush()
                return
            try:
                start, end, partial = parse_range(range_header, entry.size)
            except ValueError:
                return self.message(416, '', {'Content-Range': 'bytes */' + str(entry.size)})
            if partial:
                common['Content-Range'] = 'bytes {}-{}/{}'.format(start, end, entry.size)
            self.headers_for(206 if partial else 200, end - start + 1, entry.mime, common)
            if self.command == 'HEAD':
                return
            with entry.path.open('rb') as stream:
                stream.seek(start)
                remaining = end - start + 1
                while remaining:
                    chunk = stream.read(min(BLOCK_SIZE, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        except (OSError, ValueError) as error:
            try:
                self.message(409, str(error))
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                pass

    def do_HEAD(self):
        self.do_GET()

    def reject_write(self):
        self.message(405, 'Read-only display: GET and HEAD only', {'Allow': 'GET, HEAD'})

    do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_TRACE = do_CONNECT = reject_write


class WatchServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 64

    def __init__(self, address, package):
        self.package = package
        super().__init__(address, WatchHandler)


def main():
    parser = argparse.ArgumentParser(description='Read-only, verified portable Scicon watch display')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parent,
                        help='Package directory containing checksums.json; defaults to this script directory')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('--port must be 1..65535')
    try:
        package = VerifiedPackage(args.directory)
        server = WatchServer(('127.0.0.1', args.port), package)
    except (OSError, ValueError) as error:
        parser.exit(1, 'Cannot serve portable display: {}\n'.format(error))
    print('Verified {} package files. Read-only display: http://127.0.0.1:{}/'.format(package.verified_count, args.port), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
