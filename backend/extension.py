"""财经资讯扩展的后端路由。

契约见面板 docs/extension-packages.md：模块需导出 EXTENSION_ID /
EXTENSION_API_VERSION，提供同步的 setup(registrar)，所有路由必须落在
/api/extensions/<id>/ 前缀下。
"""

from fastapi import APIRouter, HTTPException, Query

from app.extensions import BACKEND_EXTENSION_API_VERSION

from . import news_core, tagger_dict

EXTENSION_ID = "nasvip.news"
EXTENSION_API_VERSION = BACKEND_EXTENSION_API_VERSION

PREFIX = f"/api/extensions/{EXTENSION_ID}"

_VALID_SENTIMENTS = {"", "bullish", "bearish", "neutral"}


def setup(registrar):
    router = APIRouter(prefix=PREFIX, tags=["news"])

    @router.get("/sources")
    def list_sources():
        """快讯源与情绪标签说明。"""
        return {
            "sources": news_core.sources(),
            "sentiments": [
                {"key": "bullish", "label": "利好"},
                {"key": "bearish", "label": "利空"},
                {"key": "neutral", "label": "中性"},
            ],
        }

    @router.get("/feed")
    def get_feed(
        topic: str = Query("", description="主题名，如 人工智能"),
        sentiment: str = Query("", description="bullish / bearish / neutral"),
        limit: int = Query(50, ge=1, le=100),
        page: int = Query(1, ge=1, le=200, description="页码，用于「加载更早」"),
    ):
        """三源合并后的快讯流。"""
        if sentiment not in _VALID_SENTIMENTS:
            raise HTTPException(status_code=400, detail=f"未知情绪: {sentiment}")
        try:
            return news_core.merged_feed(limit, page=page, topic=topic, sentiment=sentiment)
        except news_core.UpstreamError as exc:
            raise HTTPException(status_code=502, detail=f"上游不可用: {exc}") from exc

    @router.get("/topics")
    def list_topics():
        """主题词表（供前端筛选项使用）。"""
        return {"topics": list(tagger_dict.TOPICS.keys())}

    @router.get("/stock-batch")
    def get_stock_news_batch(
        symbols: str = Query(..., description="逗号分隔，如 600519.SH,000001.SZ"),
        per: int = Query(10, ge=1, le=30, description="每只股票取多少条"),
    ):
        """多只股票的新闻合并（自选/持仓聚合用）。"""
        codes = [part.strip() for part in symbols.split(",") if part.strip()]
        try:
            return news_core.stock_news_batch(codes, per)
        except news_core.UpstreamError as exc:
            raise HTTPException(status_code=502, detail=f"上游不可用: {exc}") from exc

    @router.get("/stock")
    def get_stock_news(
        symbol: str = Query(..., description="600519 / 600519.SH / sh600519"),
        limit: int = Query(20, ge=1, le=50),
    ):
        """个股新闻。"""
        try:
            return news_core.stock_news(symbol, limit)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except news_core.UpstreamError as exc:
            raise HTTPException(status_code=502, detail=f"上游不可用: {exc}") from exc

    registrar.include_router(router)


def startup(context):
    """无后台任务，不需要初始化。"""
