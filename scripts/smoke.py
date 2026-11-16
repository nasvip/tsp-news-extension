"""真实接口冒烟：三源合并 + 标签分布 + 个股新闻。"""
import importlib.util
import pathlib
import sys
import types

ROOT = pathlib.Path(__file__).resolve().parent.parent

pkg = types.ModuleType("newsext")
pkg.__path__ = [str(ROOT / "backend")]
sys.modules["newsext"] = pkg


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


core = _load("newsext.news_core", ROOT / "backend" / "news_core.py")


def main():
    data = core.merged_feed(50)
    stats = data["stats"]
    print(f"合并去重后 {data['total']} 条，按筛选返回 {data['count']} 条")
    print(f"情绪分布: 利好 {stats['bullish']} / 利空 {stats['bearish']} / 中性 {stats['neutral']}")
    print("主题 Top:")
    for entry in data["topics"][:8]:
        print(f"    {entry['name']:10} {entry['count']}")

    print("\n最新 10 条：")
    for item in data["items"][:10]:
        topics = "/".join(item["topics"]) or "-"
        print(f"  [{item['sentiment_label']}] {item['time']}  {item['title'][:36]}")
        print(f"        {item['source'][:14]}  ·  {topics}")

    print()
    stock = core.stock_news("600519.SH", 5)
    print(f"[个股 600519.SH] {stock['count']} 条")
    for item in stock["items"][:3]:
        print(f"  [{item['sentiment_label']}] {item['time']}  {item['title'][:36]}  ({item['source']})")


if __name__ == "__main__":
    main()
