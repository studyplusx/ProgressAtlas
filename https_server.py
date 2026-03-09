from __future__ import annotations

import argparse
import http.server
import ssl
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve the current directory over HTTPS.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--directory", default=".")
    parser.add_argument("--certfile", required=True)
    parser.add_argument("--keyfile", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    directory = str(Path(args.directory).resolve())

    handler = lambda *handler_args, **handler_kwargs: http.server.SimpleHTTPRequestHandler(
        *handler_args,
        directory=directory,
        **handler_kwargs,
    )

    server = http.server.ThreadingHTTPServer((args.host, args.port), handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=args.certfile, keyfile=args.keyfile)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print(f"Serving HTTPS on https://{args.host}:{args.port}/ from {directory}")
    server.serve_forever()


if __name__ == "__main__":
    main()
