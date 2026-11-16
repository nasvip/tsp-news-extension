"""财经资讯的取数、合并、去重与打标。纯标准库，不依赖 fastapi，便于本地单测。"""

import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from . import tagger

CST = timezone(timedelta(hours=8))
TIMEOUT = 12
CACHE_TTL = 30
_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

# 同一标题多源出现时，数字越小优先级越高
SOURCE_PRIORITY = {"em": 0, "ths": 1, "sina": 2}

_cache: dict[tuple, tuple[float, object]] = {}


class UpstreamError(RuntimeError):
    """上游请求失败或返回结构不符预期。"""


# ---------------------------------------------------------------- 基础工具


def _get(url: str, referer: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Referer": referer})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 — 统一包装成上游错误
        raise UpstreamError(f"请求失败: {exc}") from exc


def _cached(key: tuple, builder, ttl: int = CACHE_TTL):
    hit = _cache.get(key)
    now = time.time()
    if hit and now - hit[0] < ttl:
        return hit[1]
    value = builder()
    _cache[key] = (now, value)
    return value


def _fmt_epoch(value) -> str:
    try:
        ts = int(str(value).strip())
    except (TypeError, ValueError):
        return ""
    if ts <= 0:
        return ""
    return datetime.fromtimestamp(ts, CST).strftime("%Y-%m-%d %H:%M:%S")


def _clean(text) -> str:
    return " ".join(str(text or "").split())


_BRACKET = re.compile(r"^【([^】]{2,60})】\s*")
_FINGERPRINT_STRIP = re.compile(r"[^\u4e00-\u9fffA-Za-z0-9]")


def clean_summary(summary: str, title: str) -> str:
    """去掉正文开头重复的【标题】前缀（财联社等来源的习惯格式）。"""
    text = _clean(summary)
    if not text:
        return ""
    match = _BRACKET.match(text)
    if match:
        inner = match.group(1).strip()
        # 仅当前缀和标题高度重合时才裁掉，避免误伤正常摘要
        if title and (inner in title or title in inner or inner[:8] == title[:8]):
            text = text[match.end():].strip()
    return text[:400]


def fingerprint(title: str) -> str:
    """标题指纹：仅保留中文/字母/数字，取前 20 字，用于跨源去重。"""
    return _FINGERPRINT_STRIP.sub("", title or "")[:20]


def normalize_symbol(symbol: str) -> str:
    """'600519' / '600519.sh' / 'sh600519' -> '600519.SH'；无法识别返回空串。"""
    text = str(symbol or "").strip().upper()
    if not text:
        return ""
    for prefix in ("SH", "SZ", "BJ"):
        if text.startswith(prefix) and text[2:].isdigit():
            return f"{text[2:]}.{prefix}"
    if "." in text:
        code, _, suffix = text.rpartition(".")
        if code.isdigit() and suffix in ("SH", "SZ", "BJ"):
            return f"{code}.{suffix}"
    if text.isdigit() and len(text) == 6:
        if text[0] in ("6", "9"):
            return f"{text}.SH"
        if text[0] in ("0", "3"):
            return f"{text}.SZ"
        if text[0] in ("4", "8"):
            return f"{text}.BJ"
    return ""


def _item(time_text: str, title: str, summary: str, url: str, source: str, source_key: str) -> dict | None:
    title = _clean(title)
    if not title:
        return None
    body = clean_summary(summary, title)
    tags = tagger.tag(title, body)
    return {
        "time": time_text or "",
        "title": title,
        "summary": body,
        "url": url or "",
        "source": source or "",
        "source_key": source_key,
        "sentiment": tags["sentiment"],
        "sentiment_label": tags["sentiment_label"],
        "topics": tags["topics"],
    }


# ---------------------------------------------------------------- 快讯源


def fetch_ths(limit: int, page: int = 1) -> list[dict]:
    """同花顺 7x24 快讯。"""
    url = (
        "https://news.10jqka.com.cn/tapp/news/push/stock/"
        f"?page={page}&tag=&track=website&pagesize={limit}"
    )
    raw = _get(url, "https://news.10jqka.com.cn/")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise UpstreamError("同花顺返回非 JSON") from exc
    items = ((payload.get("data") or {}).get("list")) or []
    out = []
    for item in items:
        row = _item(
            _fmt_epoch(item.get("ctime")),
            item.get("title"),
            item.get("digest"),
            item.get("url") or "",
            item.get("source") or "同花顺",
            "ths",
        )
        if row:
            out.append(row)
    return out


def fetch_sina(limit: int, page: int = 1) -> list[dict]:
    """新浪财经滚动新闻。"""
    url = (
        "https://feed.mix.sina.com.cn/api/roll/get"
        f"?pageid=153&lid=2516&num={limit}&page={page}"
    )
    raw = _get(url, "https://finance.sina.com.cn/")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise UpstreamError("新浪返回非 JSON") from exc
    items = ((payload.get("result") or {}).get("data")) or []
    out = []
    for item in items:
        row = _item(
            _fmt_epoch(item.get("ctime")),
            item.get("title"),
            item.get("intro") or item.get("summary"),
            item.get("url") or "",
            item.get("media_name") or "新浪财经",
            "sina",
        )
        if row:
            out.append(row)
    return out


def fetch_eastmoney(limit: int, page: int = 1) -> list[dict]:
    """东方财富 7x24 快讯（返回是 JS 包裹的 JSON，文件名末尾两段是每页条数与页码）。"""
    url = f"https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_{limit}_{page}_.html"
    raw = _get(url, "https://kuaixun.eastmoney.com/")
    body = raw.strip()
    if body.startswith("var ajaxResult"):
        body = body.split("=", 1)[1]
    body = body.strip().rstrip(";")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise UpstreamError("东财返回解析失败") from exc
    items = payload.get("LivesList") or []
    out = []
    for item in items:
        # 东财的 type: 1=盘面异动 2=宏观数据 3=普通快讯，作为内容分类保留
        row = _item(
            str(item.get("showtime") or ""),
            item.get("title"),
            item.get("digest"),
            item.get("url_w") or item.get("url_m") or "",
            item.get("source") or "东方财富",
            "em",
        )
        if row:
            row["content_type"] = {"1": "盘面异动", "2": "宏观数据"}.get(str(item.get("type") or ""), "")
            out.append(row)
    return out


FEEDS = {
    "ths": ("同花顺", fetch_ths),
    "sina": ("新浪财经", fetch_sina),
    "em": ("东方财富", fetch_eastmoney),
}


def sources() -> list[dict]:
    return [{"key": k, "label": v[0]} for k, v in FEEDS.items()]


# ---------------------------------------------------------------- 合并


def _merge(rows: list[dict]) -> list[dict]:
    """按标题指纹去重：优先级高的留；同优先级取摘要更长的。"""
    best: dict[str, dict] = {}
    for row in rows:
        key = fingerprint(row["title"])
        if not key:
            continue
        current = best.get(key)
        if current is None:
            best[key] = row
            continue
        new_rank = (SOURCE_PRIORITY.get(row["source_key"], 9), -len(row["summary"]))
        old_rank = (SOURCE_PRIORITY.get(current["source_key"], 9), -len(current["summary"]))
        if new_rank < old_rank:
            best[key] = row
    return sorted(best.values(), key=lambda r: r["time"], reverse=True)


def _topic_names(item: dict) -> list[str]:
    """主题统一取名称（后端返回的是 [{name, group}]）。"""
    out = []
    for topic in item.get("topics") or []:
        name = topic.get("name") if isinstance(topic, dict) else topic
        if name:
            out.append(name)
    return out


def _topic_counts(items: list[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for item in items:
        for name in _topic_names(item):
            counts[name] = counts.get(name, 0) + 1
    return [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def merged_feed(limit_per_source: int = 50, page: int = 1, topic: str = "",
                sentiment: str = "") -> dict:
    """三源合并成一条流，打标后按筛选条件返回。

    page 用于「加载更早」：同一页号下三个源各自翻到对应深度再合并。
    """
    limit_per_source = max(1, min(int(limit_per_source), 100))
    page = max(1, min(int(page), 200))
    cache_key = ("merged", limit_per_source, page)
    rows = _cached(cache_key, lambda: _merge(_fetch_all(limit_per_source, page)))

    counts = {"bullish": 0, "bearish": 0, "neutral": 0}
    for row in rows:
        counts[row["sentiment"]] = counts.get(row["sentiment"], 0) + 1

    filtered = rows
    if topic:
        filtered = [r for r in filtered if topic in _topic_names(r)]
    if sentiment:
        filtered = [r for r in filtered if r.get("sentiment") == sentiment]

    return {
        "count": len(filtered),
        "total": len(rows),
        "page": page,
        "stats": counts,
        "topics": _topic_counts(rows),
        "sources": sources(),
        "items": filtered,
    }


def _fetch_all(limit_per_source: int, page: int = 1) -> list[dict]:
    """并发抓三个源；单个源失败不影响其他源。"""

    def one(key: str) -> list[dict]:
        try:
            return FEEDS[key][1](limit_per_source, page)
        except UpstreamError:
            return []

    rows: list[dict] = []
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        for chunk in pool.map(one, list(FEEDS)):
            rows.extend(chunk)
    if not rows:
        raise UpstreamError("三个快讯源都不可用")
    return rows
