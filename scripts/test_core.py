"""news_core 与 tagger 的离线单测：用构造的响应验证解析、去重、打标。"""
import importlib.util
import json
import pathlib
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# news_core 用了相对导入 from . import tagger，先造一个包外壳
pkg = types.ModuleType("newsext")
pkg.__path__ = [str(ROOT / "backend")]
sys.modules["newsext"] = pkg

core = _load("newsext.news_core", ROOT / "backend" / "news_core.py")
tagger = _load("newsext.tagger", ROOT / "backend" / "tagger.py")
tagger_dict = _load("newsext.tagger_dict", ROOT / "backend" / "tagger_dict.py")


def _with_stub(raw, fn):
    original = core._get
    core._cache.clear()
    core._get = lambda url, referer: raw
    try:
        return fn()
    finally:
        core._get = original
        core._cache.clear()


def _row(title, at, key="em", summary=""):
    return core._item(at, title, summary, "", key, key)


# ---------------------------------------------------------------- 基础


def test_normalize_symbol():
    assert core.normalize_symbol("600519") == "600519.SH"
    assert core.normalize_symbol("000001") == "000001.SZ"
    assert core.normalize_symbol("300750") == "300750.SZ"
    assert core.normalize_symbol("830799") == "830799.BJ"
    assert core.normalize_symbol("600519.SH") == "600519.SH"
    assert core.normalize_symbol("sh600519") == "600519.SH"
    assert core.normalize_symbol("600519.sh") == "600519.SH"
    assert core.normalize_symbol("") == ""
    assert core.normalize_symbol("abc") == ""


def test_fmt_epoch():
    assert core._fmt_epoch("1794801432") == "2026-11-16 11:57:12"
    assert core._fmt_epoch(None) == ""
    assert core._fmt_epoch("bad") == ""


def test_fingerprint():
    assert core.fingerprint("中国与东盟宣布将2027年定为人工智能合作年！") == \
        core.fingerprint("中国与东盟宣布将2027年定为人工智能合作年")
    assert core.fingerprint("") == ""


def test_clean_summary_strips_bracket_title():
    title = "中国与东盟宣布将2027年定为人工智能合作年"
    raw = "【" + title + "】据新华社，中国与东盟宣布将2027年定为人工智能合作年。"
    assert core.clean_summary(raw, title).startswith("据新华社")
    # 前缀跟标题无关时不要裁
    assert core.clean_summary("【重要公告】公司拟回购", "公司拟回购股份") == "【重要公告】公司拟回购"


# ---------------------------------------------------------------- 解析


def test_fetch_ths():
    title = "我国牵头制定的国际标准发布"
    raw = json.dumps({"data": {"list": [{
        "title": title,
        "digest": "记者今天从国家标准委了解到……",
        "url": "https://news.10jqka.com.cn/20261116/c681848160.shtml",
        "ctime": "1794801432",
        "source": "同花顺财经",
    }]}}, ensure_ascii=False)
    items = _with_stub(raw, lambda: core.fetch_ths(1))
    assert len(items) == 1
    assert items[0]["time"] == "2026-11-16 11:57:12"
    assert items[0]["source"] == "同花顺财经"
    assert items[0]["source_key"] == "ths"
    assert "sentiment" in items[0] and "topics" in items[0]


def test_fetch_sina():
    raw = json.dumps({"result": {"data": [{
        "title": "派格生物医药-B午前涨逾7%",
        "intro": "早盘一度涨超16%……",
        "url": "https://finance.sina.com.cn/stock/xxx.shtml",
        "ctime": "1794801217",
        "media_name": "新浪港股",
    }]}}, ensure_ascii=False)
    items = _with_stub(raw, lambda: core.fetch_sina(1))
    assert items[0]["source"] == "新浪港股"
    assert items[0]["time"].startswith("2026-11-16")


def test_fetch_eastmoney_strips_wrapper():
    payload = {"LivesList": [{
        "title": "景林资产：一批企业重新展现出较高投资吸引力",
        "digest": "近期，A股市场持续调整……",
        "url_w": "http://fund.eastmoney.com/a/202611163931658029.html",
        "showtime": "2026-11-16 11:41:07",
        "type": "2",
    }]}
    raw = "var ajaxResult=" + json.dumps(payload, ensure_ascii=False) + ";"
    items = _with_stub(raw, lambda: core.fetch_eastmoney(1))
    assert items[0]["time"] == "2026-11-16 11:41:07"
    assert items[0]["content_type"] == "宏观数据"


def test_fetch_stock_news_strips_jsonp():
    payload = {"result": {"cmsArticleWebOld": [{
        "date": "2026-11-15 12:09:48",
        "title": "最多每瓶下调52元！精品茅台售价下调",
        "content": "红星资本局11月15日消息……",
        "mediaName": "红星资本局",
        "url": "http://finance.eastmoney.com/a/202611153931410440.html",
    }]}}
    raw = "cb(" + json.dumps(payload, ensure_ascii=False) + ");"
    items = _with_stub(raw, lambda: core.fetch_stock_news("600519.SH", 1))
    assert items[0]["source"] == "红星资本局"


# ---------------------------------------------------------------- 合并


def test_merge_dedupes_and_prefers_priority():
    rows = [
        _row("中国与东盟宣布将2027年定为人工智能合作年", "2026-11-16 11:58:33", "em", "东财摘要"),
        _row("中国与东盟宣布将2027年定为人工智能合作年！", "2026-11-16 11:56:02", "ths", "同花顺摘要"),
        _row("国家统计局：10月规上工业发电量同比降2.1%", "2026-11-16 11:30:00", "em", ""),
    ]
    merged = core._merge(rows)
    assert len(merged) == 2
    # 保留东财那条
    assert merged[0]["source_key"] == "em"
    # 按时间倒序
    assert merged[0]["time"] > merged[1]["time"]


def test_merged_feed_filters():
    original = core.FEEDS
    core._cache.clear()
    core.FEEDS = {
        "ths": ("同花顺", lambda n: [_row("某公司中标重大项目 金额超预期", "2026-11-16 10:00:00", "ths")]),
        "sina": ("新浪", lambda n: [_row("某公司被立案调查 股价跌停", "2026-11-16 11:00:00", "sina")]),
        "em": ("东财", lambda n: []),
    }
    try:
        data = core.merged_feed(10)
        assert data["total"] == 2
        assert data["stats"]["bullish"] >= 1
        assert data["stats"]["bearish"] >= 1

        bull = core.merged_feed(10, sentiment="bullish")
        assert all(i["sentiment"] == "bullish" for i in bull["items"])
        assert bull["count"] == 1

        core._cache.clear()
        none = core.merged_feed(10, topic="不存在的主题")
        assert none["count"] == 0
    finally:
        core.FEEDS = original
        core._cache.clear()


# ---------------------------------------------------------------- 打标


def test_tagger_bullish():
    result = tagger.tag("某公司中标10亿元大单 业绩有望超预期", "")
    assert result["sentiment"] == "bullish"
    assert result["sentiment_label"] == "利好"


def test_tagger_bearish():
    result = tagger.tag("某公司被立案调查 股价跌停", "")
    assert result["sentiment"] == "bearish"
    assert result["sentiment_label"] == "利空"


def test_tagger_neutral_when_weak_signal():
    # 只命中一个弱词，达不到阈值
    assert tagger.tag("某公司发布公告", "内容涉及日常经营")["sentiment"] == "neutral"


def test_tagger_topics():
    result = tagger.tag("人工智能大模型算力需求爆发", "")
    names = [t["name"] for t in result["topics"]]
    assert "人工智能" in names
    assert result["topics"][0]["group"] == "tech"
    assert len(result["topics"]) <= tagger_dict.MAX_TOPICS


def test_tagger_topic_order_by_hits():
    result = tagger.tag("半导体芯片光刻机晶圆产能", "")
    assert result["topics"][0]["name"] == "半导体/芯片"

def test_tagger_summary_style_forced_neutral():
    """午评/收盘这类综述不判方向，即使正文里有涨跌词。"""
    result = tagger.tag("港股午评：恒指涨0.84% 应用软件板块下跌", "多只个股跌停")
    assert result["sentiment"] == "neutral"


def test_tagger_topics_prefer_title_over_summary():
    """标题讲汽车、摘要提宏观数据时，不该再打上宏观数据。"""
    result = tagger.tag("崔东树：10月汽车增加值0.9%", "国家统计局公布的社融数据超预期")
    assert [t["name"] for t in result["topics"]] == ["汽车"]

def test_tagger_bearish_down_move():
    assert tagger.tag("台湾证交所加权股价指数下跌5%", "")["sentiment"] == "bearish"


def test_tagger_excludes_pullback_phrases():
    """「跌幅收窄」里的『下跌/跌』不算利空。"""
    result = tagger.tag("A股三大指数跌幅收窄 创业板指跌0.5%", "")
    assert result["sentiment"] == "neutral"


def test_tagger_summary_style_has_no_topics():
    result = tagger.tag("港股午评：恒生指数涨0.84% 光通信板块跌幅居前", "半导体走弱")
    assert result["topics"] == []

