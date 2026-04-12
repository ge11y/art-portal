#!/usr/bin/env python3
"""OG BE Art Portal — standalone server with ordinals image proxy and AVIF→WebP conversion."""
import os, urllib.request, ssl, io
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 5300
ART_PATH = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(ART_PATH, ".image_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


class ProxyHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/proxy/"):
            ordinal_id = self.path[7:]  # strip /proxy/
            self.proxy_ordinal(ordinal_id)
        elif self.path == "/" or self.path.endswith(".html") or self.path.endswith(".css"):
            super().do_GET()
        else:
            super().do_GET()

    def proxy_ordinal(self, ordinal_id):
        cache_file = os.path.join(CACHE_DIR, ordinal_id.replace("/", "_") + ".webp")

        # Check cache first
        if os.path.exists(cache_file):
            with open(cache_file, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "image/webp")
            self.send_header("Content-Length", len(data))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
            return

        url = f"https://ordinals.com/content/{ordinal_id}"
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                data = resp.read()
                content_type = resp.headers.get("Content-Type", "image/jpeg")

            # Convert AVIF/other formats to WebP using Pillow
            if PIL_AVAILABLE and content_type in ("image/avif", "image/webp", "image/gif", "image/png", "image/jpeg"):
                try:
                    img = Image.open(io.BytesIO(data))
                    buf = io.BytesIO()
                    img.save(buf, "WEBP", quality=85)
                    data = buf.getvalue()
                    content_type = "image/webp"
                except Exception as e:
                    # Fallback: serve original if Pillow fails
                    pass

            # Save to cache
            try:
                with open(cache_file, "wb") as f:
                    f.write(data)
            except Exception:
                pass

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", len(data))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(502, f"Proxy error: {e}")

    def translate_path(self, path):
        if path == "/":
            path = "/index.html"
        return os.path.join(ART_PATH, path.lstrip("/"))

def run():
    os.chdir(ART_PATH)
    server = HTTPServer(("0.0.0.0", PORT), ProxyHandler)
    print(f"OG BE Art Portal: http://localhost:{PORT}")
    if PIL_AVAILABLE:
        print("Pillow image conversion: ENABLED (AVIF→WebP)")
    else:
        print("WARNING: Pillow not available — AVIF images may not display")
    server.serve_forever()

if __name__ == "__main__":
    run()
