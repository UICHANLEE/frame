"""Vercel 서버리스 진입점 — /api/* 요청을 server.Handler로 위임."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from server import Handler as _TrendHandler


class handler(_TrendHandler):
    """Vercel이 인식하는 BaseHTTPRequestHandler 서브클래스."""
