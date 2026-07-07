#!/usr/bin/env python3
"""데일리 트렌드 뷰어 — 로컬 서버 (파이썬 표준 라이브러리만 사용, API 키 불필요)

실행:  python3 server.py   →  http://localhost:8778
"""

import json
import os
import re
import sys
import time
import threading
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8778
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_TTL = 3600  # 1시간

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

CACHE = {}
CACHE_LOCK = threading.Lock()
LIKES_CACHE = {}
IMG_CACHE = {}
IMG_CACHE_LOCK = threading.Lock()
IMG_CACHE_MAX = 300

# ---------------------------------------------------------------------------
# 카테고리 · 계정 기본값
# ---------------------------------------------------------------------------

CATEGORIES = {
    "all": "오늘 인기 영상",
    "ai": "AI 영상 생성",
    "mukbang": "먹방",
    "beauty": "뷰티 메이크업",
    "vlog": "브이로그",
    "variety": "예능 하이라이트",
    "movie": "영화 드라마",
    "tech": "테크 리뷰",
    "knowledge": "지식 교양",
    "travel": "여행 브이로그",
    "animal": "강아지 고양이",
}

ACCOUNT_FILES = {
    "reels": "reels_accounts.json",
    "x": "x_accounts.json",
    "threads": "threads_accounts.json",
    "tiktok": "tiktok_accounts.json",
}

DEFAULT_ACCOUNTS = {
    "reels": [
        "openai", "runwayapp", "pika_labs", "lumalabsai", "midjourney",
        "kling_ai", "heygen_official", "higgsfield.ai", "googledeepmind",
    ],
    "x": [
        "OpenAI", "runwayml", "Kling_ai", "GoogleDeepMind", "midjourney",
        "LumaLabsAI", "pika_labs", "HeyGen_Official", "elevenlabsio", "AIatMeta",
    ],
    "threads": [
        "openai", "runwayapp", "midjourney", "googledeepmind", "heygen_official",
    ],
    "tiktok": [
        "openai", "runwayapp", "krea.ai", "elevenlabs", "sora",
        "zachking", "khaby.lame", "google",
    ],
}

# 스레드 GraphQL doc_id — 유효한 값을 넣으면 실시간 조회가 동작합니다.
THREADS_DOC_IDS = []

# ---------------------------------------------------------------------------
# 공통 유틸
# ---------------------------------------------------------------------------


def http_fetch(url, headers=None, data=None, timeout=15, method=None):
    req_headers = {"User-Agent": UA, "Accept-Language": "ko,en;q=0.8"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def http_json(url, headers=None, data=None, timeout=15):
    raw = http_fetch(url, headers=headers, data=data, timeout=timeout)
    return json.loads(raw.decode("utf-8", "replace"))


def cached(key, producer, ttl=CACHE_TTL):
    now = time.time()
    with CACHE_LOCK:
        entry = CACHE.get(key)
        if entry and now - entry[0] < entry[2]:
            return entry[1]
    data = producer()
    entry_ttl = ttl
    # 항목이 하나도 없고 오류만 있으면(전부 실패) 짧게 캐시해 곧 재시도.
    if isinstance(data, dict) and data.get("errors") and not data.get("items"):
        entry_ttl = 180
    with CACHE_LOCK:
        CACHE[key] = (time.time(), data, entry_ttl)
    return data


def clear_cache():
    with CACHE_LOCK:
        CACHE.clear()


def find_key(obj, key):
    """중첩 dict/list에서 특정 키의 값을 전부 찾아 돌려준다."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                yield v
            else:
                yield from find_key(v, key)
    elif isinstance(obj, list):
        for item in obj:
            yield from find_key(item, key)


_COUNT_MULT = {"천": 1e3, "만": 1e4, "억": 1e8, "K": 1e3, "M": 1e6, "B": 1e9}


def parse_count(text):
    """'조회수 1.2만회', '1.2M views', '1,234' 등을 숫자로."""
    if text is None:
        return 0
    if isinstance(text, (int, float)):
        return int(text)
    text = str(text)
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*([천만억KMB])?", text)
    if not m:
        return 0
    num = float(m.group(1).replace(",", ""))
    if m.group(2):
        num *= _COUNT_MULT[m.group(2)]
    return int(num)


def parse_duration(text):
    if not text:
        return 0
    parts = str(text).strip().split(":")
    try:
        seconds = 0
        for part in parts:
            seconds = seconds * 60 + int(part)
        return seconds
    except ValueError:
        return 0


def text_of(node):
    """유튜브 JSON의 {'simpleText':..} / {'runs':[..]} 텍스트."""
    if not node:
        return ""
    if isinstance(node, str):
        return node
    if "simpleText" in node:
        return node["simpleText"]
    if "runs" in node:
        return "".join(run.get("text", "") for run in node["runs"])
    return ""


# ---------------------------------------------------------------------------
# 유튜브 (InnerTube 내부 검색 API — 무인증)
# ---------------------------------------------------------------------------

YT_ENDPOINT = "https://www.youtube.com/youtubei/v1/search?prettyPrint=false"

# sp 파라미터: 업로드 기간 + 유형 필터 (관련성 정렬).
# 조회수순 정렬 sp(CAM...)는 기간 필터와 조합 시 결과가 거의 없어,
# 기간 필터로 수집한 뒤 서버에서 조회수순으로 재정렬한다.
YT_PARAMS = {
    ("video", "today"): "EgQIAhAB",
    ("video", "week"): "EgQIAxAB",
    ("video", "month"): "EgQIBBAB",
    ("video", "any"): "CAMSAhAB",
    ("shorts", "today"): "EgYIAhABGAE=",
    ("shorts", "week"): "EgYIAxABGAE=",
    ("shorts", "month"): "EgYIBBABGAE=",
    ("shorts", "any"): "CAMSBBABGAE=",
}

YT_CONTEXT = {
    "client": {
        "clientName": "WEB",
        "clientVersion": "2.20250101.00.00",
        "hl": "ko",
        "gl": "KR",
    }
}


def yt_search_raw(query, params=None, continuation=None):
    body = {"context": YT_CONTEXT}
    if continuation:
        body["continuation"] = continuation
    else:
        body["query"] = query
        if params:
            body["params"] = params
    return http_json(
        YT_ENDPOINT,
        headers={"Content-Type": "application/json"},
        data=json.dumps(body).encode("utf-8"),
        timeout=20,
    )


def yt_continuation_token(data):
    for renderer in find_key(data, "continuationItemRenderer"):
        token = (
            ((renderer.get("continuationEndpoint") or {})
             .get("continuationCommand") or {})
            .get("token")
        )
        if token:
            return token
    return None


def yt_search_items(query, params, pages=3):
    """검색 + continuation으로 여러 페이지 수집."""
    items = []
    seen = set()
    data = yt_search_raw(query, params)
    for _ in range(pages):
        for item in yt_parse_items(data):
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            items.append(item)
        token = yt_continuation_token(data)
        if not token:
            break
        try:
            data = yt_search_raw(query, params, continuation=token)
        except Exception:
            break
    return items


def yt_parse_items(data):
    items = []
    seen = set()

    for r in find_key(data, "videoRenderer"):
        vid = r.get("videoId")
        if not vid or vid in seen:
            continue
        seen.add(vid)
        duration = parse_duration(text_of(r.get("lengthText")))
        views = parse_count(
            text_of(r.get("viewCountText")) or text_of(r.get("shortViewCountText"))
        )
        items.append({
            "id": vid,
            "title": text_of(r.get("title")),
            "channel": text_of(r.get("ownerText")) or text_of(r.get("longBylineText")),
            "views": views,
            "likes": None,
            "published": text_of(r.get("publishedTimeText")),
            "duration": duration,
            "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "url": f"https://www.youtube.com/watch?v={vid}",
        })

    for r in find_key(data, "reelItemRenderer"):
        vid = r.get("videoId")
        if not vid or vid in seen:
            continue
        seen.add(vid)
        items.append({
            "id": vid,
            "title": text_of(r.get("headline")),
            "channel": "",
            "views": parse_count(text_of(r.get("viewCountText"))),
            "likes": None,
            "published": "",
            "duration": 0,
            "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "url": f"https://www.youtube.com/shorts/{vid}",
        })

    return items


def yt_fetch_likes(video_id):
    """Return YouTube Dislike 공개 API로 좋아요 수 보강."""
    if video_id in LIKES_CACHE:
        return LIKES_CACHE[video_id]
    likes = 0
    try:
        data = http_json(
            "https://returnyoutubedislikeapi.com/votes?videoId=" + video_id,
            timeout=10,
        )
        likes = int(data.get("likes") or 0)
    except Exception:
        pass
    LIKES_CACHE[video_id] = likes
    return likes


def yt_enrich_likes(items, limit=30):
    targets = [it for it in items[:limit] if it.get("likes") is None]
    if not targets:
        return
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(yt_fetch_likes, it["id"]): it for it in targets}
        for future in as_completed(futures):
            futures[future]["likes"] = future.result()


def api_videos(mode, category, period, sort):
    category = category if category in CATEGORIES else "all"
    period = period if period in ("today", "week", "month") else "week"
    mode = "shorts" if mode == "shorts" else "video"

    def produce():
        query = CATEGORIES[category]
        if mode == "shorts":
            query += " shorts"
        items = yt_search_items(query, YT_PARAMS[(mode, period)])
        if mode == "shorts":
            items = [it for it in items if it["duration"] <= 75]
        else:
            items = [it for it in items if it["duration"] == 0 or it["duration"] > 75]
        items.sort(key=lambda it: it["views"], reverse=True)
        return items[:48]

    items = cached(f"videos:{mode}:{category}:{period}", produce)
    items = [dict(it) for it in items]
    if sort == "likes":
        yt_enrich_likes(items)
        items.sort(key=lambda it: it.get("likes") or 0, reverse=True)
    return {"items": items, "mode": mode, "category": category, "period": period}


def api_search(query, sort):
    query = (query or "").strip()
    if not query:
        return {"items": []}

    def produce():
        items = yt_search_items(query, "CAMSAhAB", pages=2)
        items.sort(key=lambda it: it["views"], reverse=True)
        return items[:48]

    items = cached(f"search:{query}", produce)
    items = [dict(it) for it in items]
    if sort == "likes":
        yt_enrich_likes(items)
        items.sort(key=lambda it: it.get("likes") or 0, reverse=True)
    return {"items": items, "query": query}


# ---------------------------------------------------------------------------
# AI 탭 (Hugging Face + 구글 뉴스 RSS)
# ---------------------------------------------------------------------------


def hf_models(sort):
    url = (
        "https://huggingface.co/api/models?pipeline_tag=text-to-video"
        f"&sort={sort}&direction=-1&limit=12"
    )
    models = http_json(url, timeout=15)
    out = []
    for m in models:
        model_id = m.get("id") or m.get("modelId") or ""
        out.append({
            "id": model_id,
            "likes": m.get("likes", 0),
            "downloads": m.get("downloads", 0),
            "createdAt": (m.get("createdAt") or "")[:10],
            "url": "https://huggingface.co/" + model_id,
        })
    return out


def google_news(query, hl, gl, ceid, limit=12):
    url = (
        "https://news.google.com/rss/search?q=" + urllib.parse.quote(query)
        + f"&hl={hl}&gl={gl}&ceid={ceid}"
    )
    raw = http_fetch(url, timeout=15)
    root = ET.fromstring(raw)
    out = []
    for item in root.iter("item"):
        title = item.findtext("title") or ""
        link = item.findtext("link") or ""
        pub = item.findtext("pubDate") or ""
        source = item.findtext("source") or ""
        out.append({"title": title, "url": link, "date": pub, "source": source})
        if len(out) >= limit:
            break
    return out


def api_ai():
    def produce():
        result = {"newModels": [], "trendingModels": [], "newsKr": [], "newsEn": [], "errors": []}
        tasks = {
            "newModels": lambda: hf_models("createdAt"),
            "trendingModels": lambda: hf_models("trendingScore"),
            "newsKr": lambda: google_news("AI 영상 생성", "ko", "KR", "KR:ko"),
            "newsEn": lambda: google_news("AI video generation model", "en-US", "US", "US:en"),
        }
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(fn): name for name, fn in tasks.items()}
            for future in as_completed(futures):
                name = futures[future]
                try:
                    result[name] = future.result()
                except Exception as exc:
                    result["errors"].append(f"{name}: {exc}")
        return result

    return cached("ai", produce)


# ---------------------------------------------------------------------------
# 인스타그램 릴스 (web_profile_info — 무인증)
# ---------------------------------------------------------------------------

IG_APP_ID = "936619743392459"


def ig_fetch_reels(username):
    url = (
        "https://i.instagram.com/api/v1/users/web_profile_info/?username="
        + urllib.parse.quote(username)
    )
    data = http_json(
        url,
        headers={
            "x-ig-app-id": IG_APP_ID,
            "Accept": "*/*",
            "Referer": "https://www.instagram.com/",
        },
        timeout=15,
    )
    user = (data.get("data") or {}).get("user") or {}
    edges = ((user.get("edge_owner_to_timeline_media") or {}).get("edges")) or []
    out = []
    for edge in edges:
        node = edge.get("node") or {}
        if not node.get("is_video"):
            continue
        caption_edges = ((node.get("edge_media_to_caption") or {}).get("edges")) or []
        caption = ""
        if caption_edges:
            caption = (caption_edges[0].get("node") or {}).get("text", "")
        shortcode = node.get("shortcode", "")
        out.append({
            "id": node.get("id"),
            "username": username,
            "caption": caption[:160],
            "views": int(node.get("video_view_count") or node.get("video_play_count") or 0),
            "likes": int(((node.get("edge_liked_by") or {}).get("count"))
                         or ((node.get("edge_media_preview_like") or {}).get("count")) or 0),
            "comments": int(((node.get("edge_media_to_comment") or {}).get("count")) or 0),
            "thumb": "/api/img?u=" + urllib.parse.quote(node.get("thumbnail_src") or "", safe=""),
            "url": f"https://www.instagram.com/reel/{shortcode}/",
            "timestamp": node.get("taken_at_timestamp", 0),
        })
    return out


def api_reels():
    def produce():
        # 인스타그램은 동시 호출 버스트에 429를 반환하므로 순차 호출 + 재시도.
        accounts = load_accounts("reels")
        items, errors = [], []
        for index, acc in enumerate(accounts):
            if index:
                time.sleep(1.2)
            try:
                items.extend(ig_fetch_reels(acc))
                continue
            except urllib.error.HTTPError as exc:
                if exc.code != 429:
                    errors.append(f"@{acc}: {exc}")
                    continue
            except Exception as exc:
                errors.append(f"@{acc}: {exc}")
                continue
            time.sleep(8)
            try:
                items.extend(ig_fetch_reels(acc))
            except Exception as exc:
                errors.append(f"@{acc}: {exc}")
        items.sort(key=lambda it: it["views"], reverse=True)
        return {"items": items, "errors": errors}

    result = cached("reels", produce)
    return {**result, "accounts": load_accounts("reels")}


# ---------------------------------------------------------------------------
# X / 트위터 (syndication 임베드 API — 무인증)
# ---------------------------------------------------------------------------


def x_fetch_timeline(screen_name):
    url = (
        "https://syndication.twitter.com/srv/timeline-profile/screen-name/"
        + urllib.parse.quote(screen_name)
    )
    html = http_fetch(url, timeout=15).decode("utf-8", "replace")
    m = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        re.S,
    )
    if not m:
        raise RuntimeError("timeline 파싱 실패")
    data = json.loads(m.group(1))
    entries = (
        (((data.get("props") or {}).get("pageProps") or {}).get("timeline") or {})
        .get("entries")
    ) or []
    out = []
    for entry in entries:
        tweet = (entry.get("content") or {}).get("tweet") or {}
        if not tweet.get("id_str"):
            continue
        user = tweet.get("user") or {}
        out.append({
            "id": tweet["id_str"],
            "username": user.get("screen_name", screen_name),
            "name": user.get("name", ""),
            "text": (tweet.get("full_text") or tweet.get("text") or "")[:280],
            "likes": int(tweet.get("favorite_count") or 0),
            "comments": int(tweet.get("conversation_count") or tweet.get("reply_count") or 0),
            "retweets": int(tweet.get("retweet_count") or 0),
            "views": int(tweet.get("view_count") or 0),
            "date": tweet.get("created_at", ""),
            "url": f"https://x.com/{user.get('screen_name', screen_name)}/status/{tweet['id_str']}",
            "avatar": "/api/img?u=" + urllib.parse.quote(
                user.get("profile_image_url_https") or "", safe=""),
        })
    return out


def api_x():
    def produce():
        accounts = load_accounts("x")
        items, errors = [], []
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {pool.submit(x_fetch_timeline, acc): acc for acc in accounts}
            for future in as_completed(futures):
                acc = futures[future]
                try:
                    items.extend(future.result())
                except Exception as exc:
                    errors.append(f"@{acc}: {exc}")
        items.sort(key=lambda it: it["likes"], reverse=True)
        return {"items": items, "errors": errors}

    result = cached("x", produce)
    return {**result, "accounts": load_accounts("x")}


# ---------------------------------------------------------------------------
# 스레드 (doc_id 확보 시 실시간, 아니면 계정 바로가기 폴백)
# ---------------------------------------------------------------------------


def threads_fetch(username):
    if not THREADS_DOC_IDS:
        raise RuntimeError("doc_id 없음")
    lookup = http_fetch(
        "https://www.threads.net/@" + urllib.parse.quote(username), timeout=15
    ).decode("utf-8", "replace")
    m = re.search(r'"user_id":"(\d+)"', lookup) or re.search(r'"pk":"(\d+)"', lookup)
    if not m:
        raise RuntimeError("user_id 파싱 실패")
    user_id = m.group(1)
    last_error = None
    for doc_id in THREADS_DOC_IDS:
        try:
            body = urllib.parse.urlencode({
                "variables": json.dumps({"userID": user_id}),
                "doc_id": doc_id,
            }).encode()
            data = http_json(
                "https://www.threads.net/api/graphql",
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-IG-App-ID": "238260118697367",
                },
                data=body,
                timeout=15,
            )
            out = []
            for post in find_key(data, "post"):
                if not isinstance(post, dict) or not post.get("code"):
                    continue
                caption = (post.get("caption") or {}).get("text", "")
                out.append({
                    "id": post.get("pk"),
                    "username": username,
                    "text": caption[:280],
                    "likes": int(post.get("like_count") or 0),
                    "comments": int(((post.get("text_post_app_info") or {})
                                     .get("direct_reply_count")) or 0),
                    "reposts": int(((post.get("text_post_app_info") or {})
                                    .get("repost_count")) or 0),
                    "url": f"https://www.threads.net/@{username}/post/{post['code']}",
                })
            if out:
                return out
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"조회 실패: {last_error}")


def api_threads():
    def produce():
        accounts = load_accounts("threads")
        items, errors = [], []
        if THREADS_DOC_IDS:
            with ThreadPoolExecutor(max_workers=3) as pool:
                futures = {pool.submit(threads_fetch, acc): acc for acc in accounts}
                for future in as_completed(futures):
                    acc = futures[future]
                    try:
                        items.extend(future.result())
                    except Exception as exc:
                        errors.append(f"@{acc}: {exc}")
        fallback = not items
        links = [
            {"username": acc, "url": f"https://www.threads.net/@{acc}"}
            for acc in accounts
        ]
        return {"items": items, "fallback": fallback, "links": links, "errors": errors}

    result = cached("threads", produce)
    return {**result, "accounts": load_accounts("threads")}


# ---------------------------------------------------------------------------
# 틱톡 (tikwm 무료 공개 API)
# ---------------------------------------------------------------------------

TIKWM = "https://www.tikwm.com/api"


def tikwm_normalize(video, fallback_author=""):
    author = video.get("author") or {}
    if isinstance(author, str):
        author = {"unique_id": author}
    unique = author.get("unique_id") or fallback_author
    vid = video.get("video_id") or video.get("aweme_id") or ""
    cover = video.get("cover") or video.get("origin_cover") or ""
    if cover.startswith("/"):
        cover = "https://www.tikwm.com" + cover
    return {
        "id": vid,
        "username": unique,
        "nickname": author.get("nickname", ""),
        "title": (video.get("title") or "")[:160],
        "views": int(video.get("play_count") or 0),
        "likes": int(video.get("digg_count") or 0),
        "comments": int(video.get("comment_count") or 0),
        "thumb": "/api/img?u=" + urllib.parse.quote(cover, safe=""),
        "url": f"https://www.tiktok.com/@{unique}/video/{vid}",
        "timestamp": int(video.get("create_time") or 0),
    }


def tikwm_feed():
    data = http_json(TIKWM + "/feed/list?region=KR&count=20", timeout=45)
    if data.get("code") != 0:
        raise RuntimeError(data.get("msg", "feed 오류"))
    return [tikwm_normalize(v) for v in (data.get("data") or [])]


def tikwm_user(unique_id):
    data = http_json(
        TIKWM + "/user/posts?unique_id=" + urllib.parse.quote(unique_id) + "&count=12",
        timeout=20,
    )
    if data.get("code") != 0:
        raise RuntimeError(data.get("msg", "user 오류"))
    videos = ((data.get("data") or {}).get("videos")) or []
    return [tikwm_normalize(v, unique_id) for v in videos]


def api_tiktok():
    def produce():
        # tikwm 무료 티어는 초당 1회 제한 → 순차 호출 + 제한 시 1회 재시도.
        accounts = load_accounts("tiktok")
        items, errors = [], []
        tasks = [("인기 피드", tikwm_feed)]
        tasks += [(acc, (lambda a=acc: tikwm_user(a))) for acc in accounts]
        for index, (name, fn) in enumerate(tasks):
            if index:
                time.sleep(1.1)
            try:
                items.extend(fn())
                continue
            except Exception as exc:
                if "Limit" not in str(exc):
                    errors.append(f"{name}: {exc}")
                    continue
            time.sleep(2)
            try:
                items.extend(fn())
            except Exception as exc:
                errors.append(f"{name}: {exc}")
        seen, deduped = set(), []
        for item in items:
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            deduped.append(item)
        deduped.sort(key=lambda it: it["views"], reverse=True)
        return {"items": deduped, "errors": errors}

    result = cached("tiktok", produce)
    return {**result, "accounts": load_accounts("tiktok")}


# ---------------------------------------------------------------------------
# 계정 관리 (JSON 파일 저장)
# ---------------------------------------------------------------------------

ACCOUNTS_LOCK = threading.Lock()


def _account_path(platform):
    return os.path.join(BASE_DIR, ACCOUNT_FILES[platform])


def load_accounts(platform):
    with ACCOUNTS_LOCK:
        path = _account_path(platform)
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    accounts = json.load(f)
                if isinstance(accounts, list):
                    return accounts
            except Exception:
                pass
        return list(DEFAULT_ACCOUNTS[platform])


def save_accounts(platform, accounts):
    with ACCOUNTS_LOCK:
        with open(_account_path(platform), "w", encoding="utf-8") as f:
            json.dump(accounts, f, ensure_ascii=False, indent=2)


def api_accounts_post(payload):
    platform = payload.get("platform")
    if platform not in ACCOUNT_FILES:
        return {"error": "unknown platform"}, 400
    action = payload.get("action")
    username = (payload.get("username") or "").strip().lstrip("@")
    if not username:
        return {"error": "username required"}, 400
    accounts = load_accounts(platform)
    if action == "add":
        if username not in accounts:
            accounts.append(username)
    elif action == "remove":
        accounts = [acc for acc in accounts if acc.lower() != username.lower()]
    else:
        return {"error": "unknown action"}, 400
    save_accounts(platform, accounts)
    with CACHE_LOCK:
        CACHE.pop(platform if platform != "reels" else "reels", None)
        CACHE.pop(platform, None)
    return {"accounts": accounts}, 200


# ---------------------------------------------------------------------------
# 이미지 프록시 (CDN 핫링크 차단 우회)
# ---------------------------------------------------------------------------

IMG_ALLOWED = (
    "cdninstagram.com", "fbcdn.net", "tiktokcdn", "twimg.com",
    "ytimg.com", "googleusercontent.com", "tikwm.com", "huggingface.co",
)


def api_img(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return None, None
    host = parsed.hostname or ""
    if not any(allowed in host for allowed in IMG_ALLOWED):
        return None, None
    with IMG_CACHE_LOCK:
        if url in IMG_CACHE:
            return IMG_CACHE[url]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": ""})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            body = resp.read()
    except Exception:
        return None, None
    with IMG_CACHE_LOCK:
        if len(IMG_CACHE) >= IMG_CACHE_MAX:
            IMG_CACHE.pop(next(iter(IMG_CACHE)))
        IMG_CACHE[url] = (body, content_type)
    return body, content_type


# ---------------------------------------------------------------------------
# HTTP 핸들러
# ---------------------------------------------------------------------------

STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "TrendViewer/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    # -------------------------------------------------- helpers
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, body, content_type, cache=True):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if cache:
            self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(body)

    # -------------------------------------------------- GET
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = dict(urllib.parse.parse_qsl(parsed.query))
        try:
            if path == "/api/videos":
                self.send_json(api_videos(
                    query.get("mode", "video"),
                    query.get("category", "all"),
                    query.get("period", "week"),
                    query.get("sort", "views"),
                ))
            elif path == "/api/search":
                self.send_json(api_search(query.get("q", ""), query.get("sort", "views")))
            elif path == "/api/ai":
                self.send_json(api_ai())
            elif path == "/api/reels":
                self.send_json(api_reels())
            elif path == "/api/x":
                self.send_json(api_x())
            elif path == "/api/threads":
                self.send_json(api_threads())
            elif path == "/api/tiktok":
                self.send_json(api_tiktok())
            elif path == "/api/accounts":
                platform = query.get("platform", "")
                if platform not in ACCOUNT_FILES:
                    self.send_json({"error": "unknown platform"}, 400)
                else:
                    self.send_json({"accounts": load_accounts(platform)})
            elif path == "/api/refresh":
                clear_cache()
                self.send_json({"ok": True})
            elif path == "/api/img":
                body, content_type = api_img(query.get("u", ""))
                if body is None:
                    self.send_response(404)
                    self.end_headers()
                else:
                    self.send_bytes(body, content_type)
            else:
                self.serve_static(path)
        except BrokenPipeError:
            pass
        except Exception as exc:
            try:
                self.send_json({"error": str(exc)}, 500)
            except Exception:
                pass

    # -------------------------------------------------- POST
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            payload = {}
        try:
            if parsed.path == "/api/accounts":
                obj, status = api_accounts_post(payload)
                self.send_json(obj, status)
            elif parsed.path == "/api/refresh":
                clear_cache()
                self.send_json({"ok": True})
            else:
                self.send_json({"error": "not found"}, 404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    # -------------------------------------------------- static
    def serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        name = os.path.basename(path)
        full = os.path.join(BASE_DIR, name)
        ext = os.path.splitext(name)[1].lower()
        if ext not in STATIC_TYPES or not os.path.isfile(full):
            self.send_response(404)
            self.end_headers()
            return
        with open(full, "rb") as f:
            self.send_bytes(f.read(), STATIC_TYPES[ext], cache=False)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("=" * 48)
    print("  데일리 트렌드 뷰어 실행 중")
    print(f"  브라우저에서  http://localhost:{PORT}  접속")
    print("  종료: Ctrl+C (또는 이 창 닫기)")
    print("=" * 48)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
