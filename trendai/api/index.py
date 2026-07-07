"""Vercel 서버리스 진입점 — /api/* 요청을 server.Handler로 위임."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import Handler as handler  # noqa: F401 — Vercel이 handler 클래스를 찾음
