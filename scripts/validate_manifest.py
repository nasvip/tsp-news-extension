"""本地校验 extension.yaml 与包结构（复刻面板「导入与备份」的检查项）。

面板的完整校验在安装时执行（含浏览器加载页面、Python 导入），这里只做能在本地
静态发现的错误：清单字段、ID/版本格式、backend 模块文件、前端产物文件、路由前缀。
用法: python scripts/validate_manifest.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

ID_RE = re.compile(r"^[a-z][a-z0-9_.-]{0,79}$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
RESERVED_PREFIXES = ("official.", "core.")


def validate(doc: dict) -> list[str]:
    errors: list[str] = []

    def fail(msg: str) -> None:
        errors.append(msg)

    if doc.get("format") != "tick-extension-package":
        fail("format 必须是 tick-extension-package")
    if doc.get("format_version") != 1:
        fail("format_version 必须是 1")

    ext_id = str(doc.get("id", ""))
    if not ID_RE.match(ext_id):
        fail("id 必须小写字母开头，仅含字母/数字/下划线/点/连字符，最长 80")
    for prefix in RESERVED_PREFIXES:
        if ext_id.startswith(prefix):
            fail(f"id 不能使用保留前缀 {prefix}*")

    if not VERSION_RE.match(str(doc.get("version", ""))):
        fail("version 必须是 x.y.z")
    if doc.get("extension_api_version") != 1:
        fail("extension_api_version 必须是 1")
    if not str(doc.get("display_name", "")).strip():
        fail("display_name 不能为空")

    backend = str(doc.get("backend", "")).strip()
    if not backend:
        fail("缺少 backend 模块引用")
    else:
        module_path = ROOT / (backend.replace(".", "/") + ".py")
        if not module_path.exists():
            fail(f"backend 模块不存在: {module_path.relative_to(ROOT)}")
        else:
            source = module_path.read_text(encoding="utf-8")
            if f'EXTENSION_ID = "{ext_id}"' not in source:
                fail(f'backend 里的 EXTENSION_ID 必须等于 "{ext_id}"')
            if "EXTENSION_API_VERSION" not in source:
                fail("backend 里缺少 EXTENSION_API_VERSION")
            prefix = f"/api/extensions/{ext_id}"
            for py in (ROOT / "backend").rglob("*.py"):
                text = py.read_text(encoding="utf-8")
                for match in re.finditer(r'APIRouter\(prefix="([^"]+)"', text):
                    if not match.group(1).startswith(prefix):
                        fail(f"{py.name} 的路由前缀必须以 {prefix} 开头")

    frontend = str(doc.get("frontend", "")).strip()
    if frontend and not (ROOT / frontend).exists():
        fail(f"前端产物不存在: {frontend}")

    platforms = doc.get("platforms")
    if platforms is not None and (not isinstance(platforms, list) or not platforms):
        fail("platforms 必须是非空列表")

    return errors


def main() -> int:
    import yaml  # 仅开发期依赖

    manifest = ROOT / "extension.yaml"
    if not manifest.exists():
        print("缺少 extension.yaml", file=sys.stderr)
        return 1

    doc = yaml.safe_load(manifest.read_text(encoding="utf-8"))
    if not isinstance(doc, dict):
        print("extension.yaml 必须是对象", file=sys.stderr)
        return 1

    errors = validate(doc)
    if errors:
        print("extension.yaml 校验失败：")
        for item in errors:
            print("  -", item)
        return 1

    print("extension.yaml 校验通过")
    print(f"  id={doc['id']} version={doc['version']}")
    print(f"  backend={doc.get('backend')} frontend={doc.get('frontend')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
