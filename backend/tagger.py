"""按字典给新闻打情绪与主题标签。纯函数，便于单测。"""

from . import tagger_dict as D

BULLISH = "bullish"
BEARISH = "bearish"
NEUTRAL = "neutral"

LABELS = {BULLISH: "利好", BEARISH: "利空", NEUTRAL: "中性"}


def _count(text: str, word: str) -> int:
    if not word or not text:
        return 0
    return text.count(word)


# 这些短语里含负面词，但语义是「跌势在缓和」，命中前先剔除，避免误判利空
BEAR_EXCLUDE_PHRASES = [
    "跌幅收窄", "跌幅放缓", "跌幅缩小", "跌幅趋缓", "止跌",
    "下跌空间有限", "跌无可跌",
]

# 同理，正面词在「风险提示/不及预期」语境下要剔除
BULL_EXCLUDE_PHRASES = ["不及预期", "低于预期", "未达预期"]


def _strip_phrases(text: str, phrases: list[str]) -> str:
    for phrase in phrases:
        text = text.replace(phrase, "")
    return text


def _is_summary_style(title: str) -> bool:
    """综述类标题（午评/收盘/复盘…）不判方向。"""
    return any(word in title for word in D.NEUTRAL_TITLE_PATTERNS)


def score_sentiment(title: str, summary: str) -> tuple[str, int, int]:
    """返回 (情绪, 利好分, 利空分)。标题权重 2，摘要权重 1。"""
    if _is_summary_style(title):
        return NEUTRAL, 0, 0

    bull_text = _strip_phrases(title, BULL_EXCLUDE_PHRASES)
    bull_text_summary = _strip_phrases(summary, BULL_EXCLUDE_PHRASES)
    bear_text = _strip_phrases(title, BEAR_EXCLUDE_PHRASES)
    bear_text_summary = _strip_phrases(summary, BEAR_EXCLUDE_PHRASES)

    bull = bear = 0
    for word in D.BULLISH:
        bull += 2 * _count(bull_text, word) + _count(bull_text_summary, word)
    for word in D.BEARISH:
        bear += 2 * _count(bear_text, word) + _count(bear_text_summary, word)

    threshold = D.SENTIMENT_THRESHOLD
    if bull >= threshold and bull > bear:
        return BULLISH, bull, bear
    if bear >= threshold and bear > bull:
        return BEARISH, bull, bear
    return NEUTRAL, bull, bear


def _score_topics(text: str) -> list[tuple[int, int, str]]:
    """返回按分数排序的 (负分数, 字典顺序, 名称)。"""
    scored = []
    for index, (name, keywords) in enumerate(D.TOPICS.items()):
        hits = sum(_count(text, word) for word in keywords)
        if hits > 0:
            scored.append((-hits, index, name))
    scored.sort()
    return scored


def pick_topics(title: str, summary: str, limit: int = D.MAX_TOPICS) -> list[str]:
    """主题优先看标题；标题一个都没命中时才退到摘要。

    避免「标题讲汽车、摘要顺手提了句宏观数据」被误打成两个主题。
    """
    scored = _score_topics(title or "")
    if not scored:
        scored = _score_topics(summary or "")
    return [name for _score, _index, name in scored[:limit]]


def tag(title: str, summary: str) -> dict:
    """给一条新闻打标签。"""
    title = title or ""
    summary = summary or ""
    sentiment, bull, bear = score_sentiment(title, summary)
    # 综述类（午评/收盘）讲的是整个盘面，主题标签没有参考价值，直接不给
    topics = [] if _is_summary_style(title) else pick_topics(title, summary)
    return {
        "sentiment": sentiment,
        "sentiment_label": LABELS[sentiment],
        "sentiment_score": {"bull": bull, "bear": bear},
        "topics": topics,
    }
