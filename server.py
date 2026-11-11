#!/usr/bin/env python3
"""HTTP server with no-cache headers for development."""
import http.server
import os

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # 多线程：并发请求图片时不会相互阻塞
    server = http.server.ThreadingHTTPServer(('0.0.0.0', 9527), NoCacheHandler)
    print("Serving on http://0.0.0.0:9527 (no-cache)")
    server.serve_forever()
