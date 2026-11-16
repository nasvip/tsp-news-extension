"""离线单测跑分器（无 pytest 环境）。"""
import importlib.util
import pathlib
import sys
import traceback

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("test_core", ROOT / "scripts" / "test_core.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

tests = sorted((n, f) for n, f in vars(module).items() if n.startswith("test_") and callable(f))
failed = 0
for name, fn in tests:
    try:
        fn()
        print(f"  PASS  {name}")
    except Exception:
        failed += 1
        print(f"  FAIL  {name}")
        traceback.print_exc()

print(f"\n{len(tests) - failed}/{len(tests)} passed")
sys.exit(1 if failed else 0)
