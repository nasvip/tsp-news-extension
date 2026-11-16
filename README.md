# 财经资讯扩展（Tick Stock Panel）

给 [Tick Stock Panel](https://github.com/shy3130/tick-stock-panel) 加一个**资讯页面**：
7x24 财经快讯 + 个股新闻。用的是面板的「前后端完整包」机制，一个 ZIP 同时装后端路由和页面，**不改面板源码、不重建镜像**。

## 页面长什么样

侧栏多一个「财经资讯」，进去是两块：

**7x24 快讯**
- 同花顺 / 新浪财经 / 东方财富**三源合并**，按标题指纹去重后按时间倒序排成一条流
- 每条一张卡片：情绪胶囊（利好 / 利空 / 中性）+ 原文标记 + 标题 + 摘要 + 来源 · 时间 · 主题
- **相对时间**：刚刚 / N 分钟前 / 12:18 / 昨天 15:20 / 11/14 09:30 / 2025/11/16，悬停看完整时间戳
- **联动自选与模拟盘持仓**：新闻里提到你的股票就打「自选 / 持仓」角标，顶部「只看我的」一键筛选
- **联动个股所属板块**：按 symbol 反查概念表与行业表，新闻命中板块名时打「◈ 板块」标签
- 筛选：关键词、情绪（全部 / 利好 / 利空）、主题（带条数）
- 30 秒自动刷新，仅当页面可见且停在快讯页时触发

**个股新闻**
- 输入 `600519` / `600519.SH` / `sh600519` 都认
- 列出该股新闻，点「查看该股行情 →」直接调面板的个股详情

### 配色约定

- 情绪：利好红 / 利空绿 / 中性淡黄
- 主题按 5 大类：科技蓝 / 消费橙 / 周期金 / 金融紫 / 其他青
- 来源：东财橙 / 同花顺蓝 / 新浪紫 / 其他青蓝
- 原文蓝 / 仅摘要琥珀；自选·持仓玫红
- **标签一律不用灰色**，灰色只用于正文摘要

## 装法

1. 构建：`pwsh ./build.ps1` → `dist/news.zip`
2. 面板 → 设置 → **导入与备份** → 选择 `news.zip`（不要解压）
3. 确认信任 → 安装
4. **重启主程序容器**（后端模块只在启动时加载，刷新浏览器不算）
5. 刷新页面，侧栏出现「财经资讯」

卸载同理：整包管理里移除，重启后删除文件。

## 接口

后端路由全部挂在 `/api/extensions/nasvip.news/` 下：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/sources` | 可用快讯源 |
| GET | `/feed?source=ths&limit=50` | 快讯列表，`source` 取 `ths`/`sina`/`em`，`limit` 1~100 |
| GET | `/stock?symbol=600519.SH&limit=20` | 个股新闻，`limit` 1~50 |

统一返回 `{time, title, summary, url, source}`；后端带 30 秒进程内缓存。

## 数据源

| 源 | 接口 | 备注 |
|---|---|---|
| 同花顺 | `news.10jqka.com.cn/tapp/news/push/stock/` | 纯 JSON |
| 新浪财经 | `feed.mix.sina.com.cn/api/roll/get` | 纯 JSON |
| 东方财富 | `newsapi.eastmoney.com/kuaixun/v1/getlist_102_*.html` | 返回是 `var ajaxResult={...}`，需要剥壳 |
| 个股新闻 | `search-api-web.eastmoney.com/search/jsonp` | JSONP，需要剥 `cb(...)` |

财联社电报需要 `sign` 参数，没做。

## 已知限制

- 四个接口都是**非官方公开接口**，随时可能改字段或限流；失败时接口返回 502 并在页面上显示原因。
- 同花顺快讯的 `source` 字段常常就是「同花顺」，没有更细的媒体名。
- 页面插件的 `ctx.api` 只有面板内置的命名方法，没有通用请求方法，所以页面调扩展自己的接口是**同源 `fetch`**；它仍然自动携带登录会话，未登录会被面板挡回。
- 只做了列表和跳转，没有做已读标记、收藏、推送。

## 开发

```powershell
python scripts/validate_manifest.py   # 清单与包结构校验（不联网）
python scripts/run_tests.py           # 20 项离线单测
python scripts/smoke.py               # 真实接口冒烟：三源合并 + 个股
pwsh ./build.ps1                      # 产出 dist/news.zip
```

依赖：面板宿主的 `fastapi` 与 Python 标准库，无第三方包。

## 发布

插件包由 GitHub Actions 自动构建，**不用手动打包**。

- 推 `main` → 清单校验 + 单测 + 打包，产物存 Actions artifact
- 打 tag `vX.Y.Z` → 额外做版本一致性检查、从 `CHANGELOG.md` 抽取正文，
  自动创建 Release 并挂上 `news.zip`

发版三步：

1. 改 `extension.yaml` 的 `version`
2. 在 `CHANGELOG.md` 加一段 `## [x.y.z] - 日期`
3. `git tag vX.Y.Z && git push origin vX.Y.Z`

tag 和版本号不一致、或 CHANGELOG 缺段落时，流程直接失败，不会发出没有说明的版本。
