# AGENTS.md — tsp-news-extension

Tick Stock Panel 的**前后端完整包**：财经资讯页面（快讯 + 个股新闻）。

## 这是什么

面板支持 `extension.yaml` 形式的后端扩展包，一个 ZIP 里可同时带：

- `backend/` FastAPI 路由，挂在 `/api/extensions/<id>/`
- `frontend/extension.mjs` 页面插件（Page Pack SDK v1）

安装后**重启主程序**才生效（浏览器刷新不算）。

## 目录

```
extension.yaml            清单（format: tick-extension-package）
backend/news_core.py      取数与归一化，纯标准库，可离线单测
backend/extension.py      路由 + setup(registrar)，契约入口
frontend/extension.mjs    页面插件，原生 DOM，零构建
scripts/                  run_tests.py / test_core.py / smoke.py
build.ps1                 打包 dist/news.zip
```

## 契约要点

**后端**（见面板 `docs/extension-packages.md`）

- 模块必须导出 `EXTENSION_ID` 与 `EXTENSION_API_VERSION == 1`
- 提供**同步** `setup(registrar)`，可选同步 `startup(context)`
- 所有路由必须落在 `/api/extensions/<id>/`，否则启动校验直接失败
- 不能改核心路由，不支持 WebSocket

**前端**（见面板 `docs/page-sdk.md`）

- `export default { id, apiVersion: 1, routes, navigation }`
- `routes[].path` 必须是非根绝对路径、静态（不支持 `:param`）
- `mount(el, ctx)` 渲染，返回清理函数
- `navigation[].icon` 必须在白名单里（本包用 `BookOpen`）
- **不要 import 宿主内部模块**；样式关键部分用内联，主题色用 CSS 变量

## 构建与测试

```powershell
python scripts/validate_manifest.py   # 清单与结构校验（复刻面板规则）
python scripts/run_tests.py           # 20 项离线单测
python scripts/smoke.py               # 真实接口冒烟
pwsh ./build.ps1                      # 产出 dist/news.zip
```

打包脚本会自动清理 `__pycache__`。

## 发布

推 `main` 跑 CI；打 tag `vX.Y.Z` 自动发 Release，正文取自 `CHANGELOG.md` 对应段落。
版本号、CHANGELOG、tag 三者必须一致，否则流程失败。

## 注意事项

1. **`ctx.api` 没有通用请求方法**，只有面板内置的命名方法。扩展自己的接口只能同源 `fetch`，
   它仍会自动带登录态（cookie）。这是有意的例外，不要改成直连外部域名。
2. **东财快讯返回是 `var ajaxResult={...};`**，个股新闻是 `cb({...});`，都要剥壳再 `json.loads`。
3. **股票代码归一化**集中在 `normalize_symbol`：认 `600519` / `600519.SH` / `sh600519`，
   无后缀时按号段推断沪/深/北。
4. **上游都是非官方接口**，失败要显式抛给前端（后端 502），不要吞成空列表。
5. 页面里 30 秒自动刷新只在「快讯页 + 标签页可见」时触发，别把定时器挪到全局。
6. 重新打包必须升 `extension.yaml` 的 `version`，同版本不同内容会被面板拒绝。
