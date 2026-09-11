"""Local SatQuery demo server with a single Faster-Whisper endpoint.

Run from the repository root:
    .venv/bin/python demo/voice_server.py

It serves the modular demo at http://127.0.0.1:5173 and accepts WAV microphone
recordings at POST /transcribe. The browser creates the WAV file itself, so the
normal voice flow has no FFmpeg requirement.
"""

from __future__ import annotations

import argparse
import json
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEMO_ROOT = Path(__file__).resolve().parent
MAX_AUDIO_BYTES = 20 * 1024 * 1024
LANGUAGES = {"", "en", "hi", "mr", "ta", "te", "kn", "bn"}

if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from tools.speech_to_text import SpeechToTextError, transcribe_audio  # noqa: E402


class DemoRequestHandler(SimpleHTTPRequestHandler):
    """Serve demo assets and transcribe same-origin local microphone audio."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DEMO_ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        if urlparse(self.path).path == "/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return
        super().do_GET()

    def do_POST(self):  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/transcribe":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._send_json(HTTPStatus.LENGTH_REQUIRED, {"error": "A recording is required."})
            return

        if content_length <= 44 or content_length > MAX_AUDIO_BYTES:
            self._send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"error": "Record a short question (up to 20 MB) and try again."},
            )
            return

        requested_language = parse_qs(parsed.query).get("language", [""])[0]
        if requested_language not in LANGUAGES:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Unsupported spoken language."})
            return

        try:
            transcript = transcribe_audio(
                self.rfile.read(content_length),
                language=requested_language or None,
                task="translate",
            )
        except SpeechToTextError as error:
            self._send_json(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": str(error)})
            return
        except Exception:
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "The local speech service could not complete the recording."},
            )
            return

        self._send_json(HTTPStatus.OK, {"transcript": transcript})

    def _send_json(self, status: HTTPStatus, payload: dict[str, str]):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local SatQuery voice demo.")
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), DemoRequestHandler)
    print(f"SatQuery voice demo: http://127.0.0.1:{args.port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping voice demo.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
