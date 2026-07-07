#!/bin/bash
# trendai 저장소(https://github.com/UICHANLEE/trendai)로 푸시하는 스크립트
# 로컬 PC에서 본인 GitHub 계정으로 실행하세요.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BRANCH="${1:-main}"
git fetch origin
git subtree split --prefix=trendai -b trendai-main
git push "https://github.com/UICHANLEE/trendai.git" trendai-main:"$BRANCH"
echo "✓ https://github.com/UICHANLEE/trendai ($BRANCH) 에 푸시 완료"
