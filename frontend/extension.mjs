/**
 * 财经资讯页面插件（Page Pack SDK v1）
 *
 * 自包含单文件 ES 模块，零构建：原生 DOM。
 * 配色全部走面板主题变量（亮/暗自动切换），自定义色以 scoped CSS 变量注入。
 * 数据来自配套后端 /api/extensions/nasvip.news/*（同源 fetch，自动带登录态）。
 */

const EXT_ID = 'nasvip.news'
const BASE = '/api/extensions/' + EXT_ID
const REFRESH_MS = 30000
const PAGE_PATH = '/news'
const PAGES_PER_MORE = 2

// 主题变量注入（只在 <head> 放一次，作用域限定在 .tsp-news 内）
const THEME_CSS_ID = 'tsp-news-theme'
const THEME_CSS = `
.tsp-news{
  --n-tech: 217 91% 45%; --n-consume: 24 85% 42%; --n-cycle: 40 85% 33%;
  --n-finance: 265 70% 48%; --n-other: 178 72% 30%;
  --n-em: 24 80% 45%; --n-ths: 212 85% 45%; --n-sina: 265 70% 55%;
  --n-src: 200 40% 42%; --n-mine: 330 80% 45%; --n-fresh: 32 95% 40%;
}
html.dark .tsp-news{
  --n-tech: 213 94% 72%; --n-consume: 25 95% 72%; --n-cycle: 45 90% 62%;
  --n-finance: 265 90% 78%; --n-other: 175 65% 58%;
  --n-em: 24 90% 68%; --n-ths: 210 95% 70%; --n-sina: 265 90% 78%;
  --n-src: 200 45% 70%; --n-mine: 330 90% 72%; --n-fresh: 40 95% 62%;
}
`

function ensureThemeCss() {
  if (document.getElementById(THEME_CSS_ID)) return
  const node = document.createElement('style')
  node.id = THEME_CSS_ID
  node.textContent = THEME_CSS
  document.head.append(node)
}

// 宿主变量（hsl 三元组）
const H = {
  text: 'hsl(var(--fg-primary))',
  body: 'hsl(var(--fg-secondary))',
  muted: 'hsl(var(--fg-muted))',
  line: 'hsl(var(--border))',
  card: 'hsl(var(--surface))',
  accent: 'hsl(var(--accent))',
  bull: 'hsl(var(--bull))',
  bear: 'hsl(var(--bear))',
  warn: 'hsl(var(--warning))',
  danger: 'hsl(var(--danger))',
}

// 自定义变量（本包注入）
const N = {
  tech: 'hsl(var(--n-tech))',
  consume: 'hsl(var(--n-consume))',
  cycle: 'hsl(var(--n-cycle))',
  finance: 'hsl(var(--n-finance))',
  other: 'hsl(var(--n-other))',
  mine: 'hsl(var(--n-mine))',
  fresh: 'hsl(var(--n-fresh))',
}

const ALPHA = {
  bull: 'hsl(var(--bull) / 0.12)',
  bullBd: 'hsl(var(--bull) / 0.30)',
  bear: 'hsl(var(--bear) / 0.12)',
  bearBd: 'hsl(var(--bear) / 0.30)',
  warn: 'hsl(var(--warning) / 0.12)',
  warnBd: 'hsl(var(--warning) / 0.28)',
  accent: 'hsl(var(--accent) / 0.12)',
  accentBd: 'hsl(var(--accent) / 0.30)',
  mine: 'hsl(var(--n-mine) / 0.12)',
  mineBd: 'hsl(var(--n-mine) / 0.30)',
  tech: 'hsl(var(--n-tech) / 0.12)',
  techBd: 'hsl(var(--n-tech) / 0.28)',
  consume: 'hsl(var(--n-consume) / 0.12)',
  consumeBd: 'hsl(var(--n-consume) / 0.28)',
  cycle: 'hsl(var(--n-cycle) / 0.12)',
  cycleBd: 'hsl(var(--n-cycle) / 0.28)',
  finance: 'hsl(var(--n-finance) / 0.12)',
  financeBd: 'hsl(var(--n-finance) / 0.28)',
  other: 'hsl(var(--n-other) / 0.12)',
  otherBd: 'hsl(var(--n-other) / 0.28)',
}

const TONE = {
  bullish: { color: H.bull, text: H.bull, bg: ALPHA.bull, bd: ALPHA.bullBd, label: '利好' },
  bearish: { color: H.bear, text: H.bear, bg: ALPHA.bear, bd: ALPHA.bearBd, label: '利空' },
  neutral: { color: H.warn, text: H.warn, bg: ALPHA.warn, bd: ALPHA.warnBd, label: '中性' },
}

const GROUP = {
  tech: { text: N.tech, bg: ALPHA.tech, bd: ALPHA.techBd },
  consume: { text: N.consume, bg: ALPHA.consume, bd: ALPHA.consumeBd },
  cycle: { text: N.cycle, bg: ALPHA.cycle, bd: ALPHA.cycleBd },
  finance: { text: N.finance, bg: ALPHA.finance, bd: ALPHA.financeBd },
  other: { text: N.other, bg: ALPHA.other, bd: ALPHA.otherBd },
}

const SOURCE_STYLE = {
  em: { text: 'hsl(var(--n-em))', bg: 'hsl(var(--n-em) / 0.10)', bd: 'hsl(var(--n-em) / 0.26)' },
  ths: { text: 'hsl(var(--n-ths))', bg: 'hsl(var(--n-ths) / 0.10)', bd: 'hsl(var(--n-ths) / 0.26)' },
  sina: { text: 'hsl(var(--n-sina))', bg: 'hsl(var(--n-sina) / 0.10)', bd: 'hsl(var(--n-sina) / 0.26)' },
}
const SOURCE_FALLBACK = { text: 'hsl(var(--n-src))', bg: 'hsl(var(--n-src) / 0.10)', bd: 'hsl(var(--n-src) / 0.26)' }

// ---------------------------------------------------------------- 基础工具

function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'style') Object.assign(node.style, v)
    else if (k === 'text') node.textContent = v
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v)
    else if (k === 'dataset') Object.assign(node.dataset, v)
    else node.setAttribute(k, v === true ? '' : String(v))
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  }
  return node
}

async function getJSON(path) {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json()).detail
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(detail || 'HTTP ' + res.status)
  }
  return res.json()
}

function fingerprint(title) {
  return String(title || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '').slice(0, 20)
}

function relTime(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return { text: raw, full: raw, fresh: false }
  const moment = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))
  const now = new Date()
  const full = `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}`
  const diff = (now.getTime() - moment.getTime()) / 1000
  if (diff >= 0 && diff < 60) return { text: '刚刚', full, fresh: true }
  if (diff >= 0 && diff < 3600) return { text: `${Math.floor(diff / 60)} 分钟前`, full, fresh: false }
  if (moment.toDateString() === now.toDateString()) return { text: `${m[4]}:${m[5]}`, full, fresh: false }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (moment.toDateString() === yesterday.toDateString()) {
    return { text: `昨天 ${m[4]}:${m[5]}`, full, fresh: false }
  }
  if (+m[1] === now.getFullYear()) return { text: `${m[2]}/${m[3]} ${m[4]}:${m[5]}`, full, fresh: false }
  return { text: `${m[1]}/${m[2]}/${m[3]}`, full, fresh: false }
}

function openUrl(url) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

// ---------------------------------------------------------------- 卡片组件

function sentimentPill(item) {
  const tone = TONE[item.sentiment] || TONE.neutral
  return h('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '11.5px', fontWeight: '600', padding: '2px 8px', borderRadius: '5px',
      color: tone.text, background: tone.bg, border: '1px solid ' + tone.bd,
      whiteSpace: 'nowrap', flex: '0 0 auto',
    },
  },
    h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: tone.color } }),
    tone.label)
}

function kindBadge(item) {
  const hasUrl = Boolean(item.url)
  return h('span', {
    text: hasUrl ? '原文' : '仅摘要',
    style: {
      fontSize: '10.5px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px',
      color: hasUrl ? H.accent : H.warn,
      background: hasUrl ? ALPHA.accent : ALPHA.warn,
      border: '1px solid ' + (hasUrl ? ALPHA.accentBd : ALPHA.warnBd),
      whiteSpace: 'nowrap', flex: '0 0 auto',
    },
  })
}

function topicChip(topic) {
  const palette = GROUP[topic.group] || GROUP.other
  return h('span', {
    text: topic.name,
    style: {
      fontSize: '10.5px', fontWeight: '500', padding: '1px 7px', borderRadius: '4px',
      color: palette.text, background: palette.bg, border: '1px solid ' + palette.bd,
      whiteSpace: 'nowrap',
    },
  })
}

function sectorChip(names) {
  return h('span', {
    text: '◈ ' + names.slice(0, 2).join(' / '),
    title: names.join(' / '),
    style: {
      fontSize: '10.5px', fontWeight: '600', padding: '1px 7px', borderRadius: '4px',
      color: N.other, background: ALPHA.other, border: '1px dashed ' + ALPHA.otherBd,
      whiteSpace: 'nowrap',
    },
  })
}

function mineBadge(kinds) {
  return h('span', {
    text: kinds.has('hold') ? '持仓' : '自选',
    style: {
      fontSize: '10.5px', fontWeight: '600', padding: '1px 7px', borderRadius: '4px',
      color: N.mine, background: ALPHA.mine, border: '1px solid ' + ALPHA.mineBd,
      whiteSpace: 'nowrap',
    },
  })
}

function buildCard(item) {
  const time = relTime(item.time)
  const timeNode = h('span', {
    text: time.text,
    title: time.full,
    dataset: { iso: item.time || '' },
    style: {
      color: time.fresh ? N.fresh : H.body,
      fontWeight: time.fresh ? '600' : '400',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    },
  })

  const title = h('span', {
    text: item.title,
    style: {
      color: H.text, fontSize: '14px', fontWeight: '600', lineHeight: '1.5',
      flex: '1 1 auto', minWidth: '0', cursor: item.url ? 'pointer' : 'default',
    },
    onclick: item.url ? () => openUrl(item.url) : undefined,
  })

  const arrow = item.url
    ? h('span', {
        text: '↗', title: '打开原文',
        style: { color: H.accent, fontSize: '12px', cursor: 'pointer', flex: '0 0 auto' },
        onclick: (e) => { e.stopPropagation(); openUrl(item.url) },
      })
    : null

  const summary = item.summary
    ? h('div', {
        text: item.summary,
        style: {
          color: H.body, fontSize: '12.5px', lineHeight: '1.7', marginTop: '6px',
          display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
      })
    : null

  const foot = [
    // 来源与时间同色：按你的要求，标签不做花哨配色
    h('span', { text: item.source || '', style: { color: H.body, fontWeight: '600' } }),
    timeNode,
    ...(item.topics || []).map(topicChip),
    item.sectorNames?.length ? sectorChip(item.sectorNames) : null,
    item.mineKinds?.size ? mineBadge(item.mineKinds) : null,
  ].filter(Boolean)

  const card = h('article', {
    style: {
      border: '1px solid ' + H.line, background: H.card, borderRadius: '10px',
      padding: '12px 15px', transition: 'border-color .15s ease',
    },
  },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      sentimentPill(item), kindBadge(item), title, arrow),
    summary,
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        marginTop: '8px', fontSize: '11px',
      },
    }, foot))

  card.addEventListener('mouseenter', () => { card.style.borderColor = 'hsl(var(--accent) / 0.45)' })
  card.addEventListener('mouseleave', () => { card.style.borderColor = H.line })
  return card
}

// ---------------------------------------------------------------- 页面

function mount(el, ctx) {
  ensureThemeCss()

  const state = {
    tab: 'feed',
    keyword: '',
    topic: '',
    sentiment: '',
    onlyMine: false,
    auto: true,
    loading: false,
    moreLoading: false,
    error: '',
    items: [],
    stats: { bullish: 0, bearish: 0, neutral: 0 },
    topics: [],
    page: 1,
    exhausted: false,
    mine: { ready: false, list: [], sectors: [] },
    stockView: 'all',        // all | hold | watch | search
    stockItems: [],
    stockLoading: false,
    stockError: '',
    stockNote: '',
    searchText: '',
  }
  const store = new Map()      // 快讯：指纹 -> item，翻页/刷新统一去重
  let alive = true
  let timer = null
  let clock = null

  el.innerHTML = ''
  const root = h('div', {
    style: { maxWidth: '1080px', margin: '0 auto', padding: '18px 20px 60px' },
  })
  root.classList.add('tsp-news')
  el.append(root)

  // ---- 头部 ----
  const tabs = h('div', { style: { display: 'flex', gap: '8px' } })
  const statusText = h('div', { style: { color: H.body, fontSize: '12px', marginLeft: 'auto' } })
  const header = h('div', {
    style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' },
  }, h('div', { text: '财经资讯', style: { fontSize: '18px', fontWeight: '700', color: H.text } }), tabs, statusText)

  // ---- 快讯工具条 ----
  const searchInput = h('input', {
    type: 'search', placeholder: '搜索标题或摘要',
    oninput: (e) => { state.keyword = e.target.value.trim(); paintFeed() },
    style: {
      flex: '1 1 180px', minWidth: '140px', height: '32px', padding: '0 10px',
      borderRadius: '8px', border: '1px solid ' + H.line, background: 'transparent',
      color: H.text, fontSize: '13px', outline: 'none',
    },
  })

  const mineToggle = h('button', { text: '只看我的', style: {} })
  function paintMineToggle() {
    const n = state.mine.list.length
    mineToggle.textContent = state.mine.ready && n ? `只看我的 · ${n}` : '只看我的'
    Object.assign(mineToggle.style, {
      height: '32px', padding: '0 12px', borderRadius: '8px', cursor: 'pointer',
      fontSize: '12.5px',
      border: '1px solid ' + (state.onlyMine ? ALPHA.mineBd : H.line),
      background: state.onlyMine ? ALPHA.mine : 'transparent',
      color: state.onlyMine ? N.mine : H.text,
    })
  }
  mineToggle.addEventListener('click', () => {
    state.onlyMine = !state.onlyMine
    paintMineToggle()
    paintFeed()
  })

  const autoBox = h('input', {
    type: 'checkbox', checked: true,
    onchange: (e) => { state.auto = e.target.checked; schedule() },
  })
  const autoLabel = h('label', {
    style: { display: 'flex', alignItems: 'center', gap: '6px', color: H.body, fontSize: '12.5px', cursor: 'pointer' },
  }, autoBox, document.createTextNode('自动刷新'))

  const refreshBtn = h('button', {
    text: '刷新',
    onclick: () => loadFeed(true),
    style: {
      height: '32px', padding: '0 14px', borderRadius: '8px', border: '1px solid ' + H.line,
      background: 'transparent', color: H.text, fontSize: '13px', cursor: 'pointer',
    },
  })

  const toolRow = h('div', {
    style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  }, searchInput, mineToggle, autoLabel, refreshBtn)

  const sentimentRow = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' } })
  const topicRow = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } })
  const feedList = h('div', { style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '9px' } })
  const moreBtn = h('button', {
    text: '加载更早',
    onclick: () => loadMore(),
    style: {
      alignSelf: 'center', marginTop: '6px', height: '30px', padding: '0 18px',
      borderRadius: '8px', border: '1px solid ' + H.line, background: 'transparent',
      color: H.body, fontSize: '12.5px', cursor: 'pointer',
    },
  })
  const moreWrap = h('div', { style: { display: 'flex', justifyContent: 'center' } }, moreBtn)
  const feedPanel = h('div', {}, toolRow, sentimentRow, topicRow, feedList, moreWrap)

  // ---- 个股工具条 ----
  const stockChips = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } })
  const stockSearch = h('input', {
    type: 'text', placeholder: '输入代码或名称，如 600519 / 茅台',
    onkeydown: (e) => { if (e.key === 'Enter') runStockSearch() },
    oninput: (e) => { state.searchText = e.target.value.trim() },
    style: {
      flex: '1 1 200px', minWidth: '160px', height: '32px', padding: '0 10px',
      borderRadius: '8px', border: '1px solid ' + H.line, background: 'transparent',
      color: H.text, fontSize: '13px', outline: 'none',
    },
  })
  const stockSearchBtn = h('button', {
    text: '搜索',
    onclick: () => runStockSearch(),
    style: {
      height: '32px', padding: '0 14px', borderRadius: '8px', border: '1px solid ' + ALPHA.accentBd,
      background: ALPHA.accent, color: H.accent, fontSize: '13px', cursor: 'pointer',
    },
  })
  const stockBar = h('div', {
    style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  }, stockChips, stockSearch, stockSearchBtn)
  const stockNote = h('div', { style: { color: H.body, fontSize: '11.5px', marginTop: '8px' } })
  const stockList = h('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '9px' } })
  const stockPanel = h('div', { style: { display: 'none' } }, stockBar, stockNote, stockList)

  root.append(header, feedPanel, stockPanel)

  // ---------------------------------------------------------------- 绘制

  function chip(label, active, onClick, activeColor) {
    return h('button', {
      text: label, onclick: onClick,
      style: {
        height: '26px', padding: '0 10px', borderRadius: '6px', cursor: 'pointer',
        fontSize: '12px',
        border: '1px solid ' + (active ? (activeColor || H.accent) : H.line),
        background: active ? 'hsl(var(--accent) / 0.14)' : 'transparent',
        color: active ? (activeColor || H.accent) : H.text,
      },
    })
  }

  function paintTabs() {
    tabs.textContent = ''
    tabs.append(
      chip('7x24 快讯', state.tab === 'feed', () => {
        state.tab = 'feed'; paintTabs(); paintPanels(); loadFeed()
      }),
      chip('个股新闻', state.tab === 'stock', () => {
        state.tab = 'stock'
        paintTabs()
        paintPanels()
        // 不依赖 mine 是否就绪：直接尝试加载，空列表会在 loadStockView 里给提示
        if (!state.stockItems.length && !state.stockLoading) loadStockView(state.stockView || 'all')
      }),
    )
  }

  function paintPanels() {
    feedPanel.style.display = state.tab === 'feed' ? '' : 'none'
    stockPanel.style.display = state.tab === 'stock' ? '' : 'none'
  }

  function paintSentimentRow() {
    sentimentRow.textContent = ''
    for (const [key, label] of [['', '全部'], ['bullish', '利好'], ['bearish', '利空']]) {
      const tone = key ? TONE[key] : null
      sentimentRow.append(chip(label, state.sentiment === key, () => {
        state.sentiment = key; paintSentimentRow(); loadFeed(true)
      }, tone ? tone.color : undefined))
    }
    if (state.stats.bullish || state.stats.bearish) {
      sentimentRow.append(h('span', {
        text: `利好 ${state.stats.bullish} · 利空 ${state.stats.bearish} · 中性 ${state.stats.neutral}`,
        style: { color: H.body, fontSize: '11.5px', marginLeft: '4px', alignSelf: 'center' },
      }))
    }
  }

  function paintTopicRow() {
    topicRow.textContent = ''
    if (!state.topics.length) return
    topicRow.append(chip('全部主题', state.topic === '', () => {
      state.topic = ''; paintTopicRow(); loadFeed(true)
    }))
    for (const entry of state.topics.slice(0, 16)) {
      topicRow.append(chip(`${entry.name} ${entry.count}`, state.topic === entry.name, () => {
        state.topic = entry.name; paintTopicRow(); loadFeed(true)
      }))
    }
  }

  function paintStockChips() {
    stockChips.textContent = ''
    const list = state.mine.list
    const count = (kind) => list.filter((e) => e.kinds.has(kind)).length
    const options = [
      ['all', `全部 ${list.length}`],
      ['hold', `持仓 ${count('hold')}`],
      ['watch', `自选 ${count('watch')}`],
    ]
    for (const [key, label] of options) {
      stockChips.append(chip(label, state.stockView === key, () => loadStockView(key)))
    }
  }

  function status(text, tone) {
    statusText.textContent = text || ''
    statusText.style.color = tone === 'error' ? H.danger : H.body
  }

  function visibleItems() {
    let list = state.items
    if (state.keyword) {
      const kw = state.keyword.toLowerCase()
      list = list.filter((it) =>
        (it.title || '').toLowerCase().includes(kw) || (it.summary || '').toLowerCase().includes(kw))
    }
    if (state.onlyMine) list = list.filter((it) => it.mineKinds?.size)
    return list
  }

  function paintFeed() {
    feedList.textContent = ''
    if (state.error) {
      feedList.append(h('div', { text: state.error, style: { color: H.danger, fontSize: '13px', padding: '16px 4px' } }))
      moreWrap.style.display = 'none'
      return
    }
    if (state.loading && !state.items.length) {
      feedList.append(h('div', { text: '加载中…', style: { color: H.body, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    const items = visibleItems()
    if (!items.length) {
      feedList.append(h('div', {
        text: state.onlyMine ? '当前没有命中自选/持仓的新闻' : (state.keyword ? '没有匹配的条目' : '暂无数据'),
        style: { color: H.body, fontSize: '13px', padding: '16px 4px' },
      }))
    }
    for (const item of items) feedList.append(buildCard(item))
    if (state.keyword || state.onlyMine) {
      feedList.append(h('div', {
        text: `显示 ${items.length} / ${state.items.length} 条`,
        style: { color: H.body, fontSize: '12px', padding: '6px 2px' },
      }))
    }
    moreWrap.style.display = state.exhausted ? 'none' : 'flex'
    moreBtn.textContent = state.moreLoading ? '加载中…' : '加载更早'
    moreBtn.disabled = state.moreLoading
    moreBtn.style.opacity = state.moreLoading ? '0.6' : '1'
  }

  function paintStock() {
    stockList.textContent = ''
    if (state.stockError) {
      stockList.append(h('div', { text: state.stockError, style: { color: H.danger, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (state.stockLoading) {
      stockList.append(h('div', { text: '加载中…', style: { color: H.body, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (!state.stockItems.length) {
      let hint = '没有相关新闻'
      if (!state.mine.ready) {
        hint = '正在读取自选与持仓…'
      } else if (state.stockView !== 'search') {
        const n = symbolsForView(state.stockView).length
        if (!n) {
          hint = state.stockView === 'hold'
            ? '模拟盘当前没有持仓'
            : (state.stockView === 'watch' ? '还没有自选股' : '先在面板里添加自选股，或直接搜索代码')
        }
      }
      const retry = h('button', {
        text: '重新加载',
        onclick: () => loadStockView(state.stockView || 'all'),
        style: {
          marginLeft: '10px', height: '26px', padding: '0 12px', borderRadius: '6px',
          border: '1px solid ' + H.line, background: 'transparent', color: H.accent,
          fontSize: '12px', cursor: 'pointer',
        },
      })
      stockList.append(h('div', {
        style: { display: 'flex', alignItems: 'center', color: H.body, fontSize: '13px', padding: '16px 4px' },
      }, hint, state.mine.ready ? retry : null))
      return
    }
    if (state.stockView === 'search' && ctx.ui?.openStockPreview) {
      const symbol = state.stockItems[0]?.symbol
      if (symbol) {
        stockList.append(h('button', {
          text: '查看该股行情 →',
          onclick: () => ctx.ui.openStockPreview({ symbol }),
          style: {
            alignSelf: 'flex-start', height: '28px', padding: '0 12px', borderRadius: '6px',
            border: '1px solid ' + H.line, background: 'transparent', color: H.accent,
            fontSize: '12.5px', cursor: 'pointer',
          },
        }))
      }
    }
    for (const item of state.stockItems) stockList.append(buildCard(item))
  }

  // ---------------------------------------------------------------- 我的

  function annotate(item) {
    const mine = state.mine
    if (!mine.ready || !mine.list.length) {
      item.mineKinds = null
      item.sectorNames = null
      return
    }
    const text = `${item.title || ''} ${item.summary || ''}`
    const kinds = new Set()
    for (const entry of mine.list) {
      const byCode = entry.code && text.includes(entry.code)
      const byName = entry.name && entry.name.length >= 3 && text.includes(entry.name)
      if (byCode || byName) for (const k of entry.kinds) kinds.add(k)
    }
    item.mineKinds = kinds.size ? kinds : null
    const hitSectors = []
    for (const sector of mine.sectors) {
      if (sector.length >= 2 && text.includes(sector)) hitSectors.push(sector)
    }
    item.sectorNames = hitSectors.length ? hitSectors : null
  }

  function annotateAll() {
    for (const item of state.items) annotate(item)
    for (const item of state.stockItems) annotate(item)
  }

  async function loadMine() {
    const map = new Map()
    try {
      const wl = await getJSON('/api/watchlist')
      for (const row of wl.symbols || []) {
        if (!row?.symbol) continue
        map.set(row.symbol, {
          symbol: row.symbol, code: String(row.symbol).split('.')[0],
          name: row.name || '', kinds: new Set(['watch']),
        })
      }
    } catch { /* 无自选 */ }

    try {
      const acc = await getJSON('/api/paper/accounts')
      for (const account of acc.accounts || []) {
        if (!account?.id) continue
        const pos = await getJSON('/api/paper/positions?account=' + encodeURIComponent(account.id))
        for (const hold of pos.holdings || []) {
          if (!hold?.symbol) continue
          const cur = map.get(hold.symbol) || {
            symbol: hold.symbol, code: String(hold.symbol).split('.')[0],
            name: '', kinds: new Set(),
          }
          cur.kinds.add('hold')
          map.set(hold.symbol, cur)
        }
      }
    } catch { /* 无模拟盘 */ }

    const sectors = new Set()
    for (const entry of map.values()) {
      const qs = '?filter=symbol:' + encodeURIComponent(entry.symbol) + '&limit=1'
      try {
        const gn = await getJSON('/api/ext-data/ext_gn_ths/rows' + qs)
        const row = (gn.rows || [])[0]
        if (row) {
          if (!entry.name) entry.name = row['股票简称'] || ''
          for (const part of String(row['所属概念'] || '').split(';')) {
            const name = part.trim()
            if (name) sectors.add(name)
          }
        }
      } catch { /* 概念表未启用 */ }
      try {
        const hy = await getJSON('/api/ext-data/ext_hy_ths/rows' + qs)
        const row = (hy.rows || [])[0]
        for (const part of String(row?.['所属同花顺行业'] || '').split(';')) {
          const name = part.trim()
          if (name) sectors.add(name)
        }
      } catch { /* 行业表未启用 */ }
    }

    state.mine = { ready: true, list: [...map.values()], sectors: [...sectors] }
    paintMineToggle()
    paintStockChips()
    annotateAll()
    paintFeed()
    // 读完自选/持仓就主动把个股页的数据拉好，避免切过去还要等
    if (state.mine.list.length && !state.stockItems.length && !state.stockLoading) {
      loadStockView(state.stockView || 'all')
    } else {
      paintStock()
    }
  }

  // ---------------------------------------------------------------- 快讯加载

  function absorb(items) {
    let added = 0
    for (const item of items) {
      const fp = fingerprint(item.title)
      if (!fp || store.has(fp)) continue
      annotate(item)
      store.set(fp, item)
      added += 1
    }
    state.items = [...store.values()].sort((a, b) => String(b.time).localeCompare(String(a.time)))
    return added
  }

  async function fetchFeedPage(page) {
    const qs = new URLSearchParams()
    if (state.topic) qs.set('topic', state.topic)
    if (state.sentiment) qs.set('sentiment', state.sentiment)
    qs.set('limit', '50')
    qs.set('page', String(page))
    return getJSON(BASE + '/feed?' + qs.toString())
  }

  async function loadFeed(force = false) {
    if (state.loading && !force) return
    state.loading = true
    state.error = ''
    if (force) paintFeed()
    status('加载中…')
    try {
      const data = await fetchFeedPage(1)
      if (!alive) return
      store.clear()
      state.page = 1
      state.exhausted = false
      state.stats = data.stats || state.stats
      state.topics = data.topics || []
      absorb(data.items || [])
      paintSentimentRow()
      paintTopicRow()
      status(`共 ${state.items.length} 条 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`)
    } catch (err) {
      if (!alive) return
      state.error = '加载失败：' + (err && err.message ? err.message : String(err))
      status('加载失败', 'error')
    } finally {
      state.loading = false
      if (alive) paintFeed()
    }
  }

  /** 自动刷新：只把新出现的条目并进来，不清空已翻过的历史。 */
  async function refreshTop() {
    try {
      const data = await fetchFeedPage(1)
      if (!alive) return
      const added = absorb(data.items || [])
      state.stats = data.stats || state.stats
      state.topics = data.topics || []
      paintSentimentRow()
      paintTopicRow()
      if (added) paintFeed()
      status(`共 ${state.items.length} 条 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`)
    } catch {
      /* 自动刷新失败静默，等下一次 */
    }
  }

  async function loadMore() {
    if (state.moreLoading || state.exhausted) return
    state.moreLoading = true
    paintFeed()
    let added = 0
    let page = state.page
    try {
      for (let i = 0; i < PAGES_PER_MORE; i++) {
        page += 1
        const data = await fetchFeedPage(page)
        if (!alive) return
        added += absorb(data.items || [])
      }
      state.page = page
      if (!added) {
        state.exhausted = true
        status('没有更早的新闻了')
      }
    } catch (err) {
      status('加载更早失败：' + (err && err.message ? err.message : String(err)), 'error')
    } finally {
      state.moreLoading = false
      if (alive) paintFeed()
    }
  }

  // ---------------------------------------------------------------- 个股加载

  function symbolsForView(view) {
    const list = state.mine.list
    if (view === 'hold') return list.filter((e) => e.kinds.has('hold')).map((e) => e.symbol)
    if (view === 'watch') return list.filter((e) => e.kinds.has('watch')).map((e) => e.symbol)
    return list.map((e) => e.symbol)
  }

  async function loadStockView(view) {
    state.stockView = view
    paintStockChips()
    const symbols = symbolsForView(view)
    if (!symbols.length) {
      state.stockItems = []
      state.stockNote.textContent = !state.mine.ready
        ? ''
        : (view === 'hold' ? '模拟盘当前没有持仓' : view === 'watch' ? '还没有自选股' : '')
      paintStock()
      return
    }
    state.stockLoading = true
    state.stockError = ''
    state.stockNote.textContent = ''
    paintStock()
    try {
      const data = await getJSON(
        `${BASE}/stock-batch?symbols=${encodeURIComponent(symbols.join(','))}&per=8`)
      if (!alive) return
      state.stockItems = data.items || []
      const noteParts = [`聚合 ${data.symbols?.length || 0} 只股票，去重后 ${state.stockItems.length} 条`]
      if (data.truncated) noteParts.push('（股票过多，仅取前 30 只）')
      state.stockNote.textContent = noteParts.join(' ')
      annotateAll()
    } catch (err) {
      if (!alive) return
      state.stockError = '加载失败：' + (err && err.message ? err.message : String(err))
      state.stockItems = []
    } finally {
      state.stockLoading = false
      if (alive) paintStock()
    }
  }

  async function runStockSearch() {
    const raw = (state.searchText || stockSearch.value || '').trim()
    if (!raw) { stockSearch.focus(); return }
    state.stockView = 'search'
    state.stockLoading = true
    state.stockError = ''
    state.stockNote.textContent = ''
    paintStockChips()
    paintStock()
    try {
      let symbol = raw
      let label = ''
      if (!/^\d{6}(\.(SH|SZ|BJ))?$/i.test(raw)) {
        const found = await getJSON('/api/kline/instruments/search?q=' + encodeURIComponent(raw) + '&limit=1')
        const hit = (found.results || [])[0]
        if (!hit) throw new Error(`没有找到「${raw}」对应的股票`)
        symbol = hit.symbol
        label = hit.name || ''
      }
      const data = await getJSON(`${BASE}/stock?symbol=${encodeURIComponent(symbol)}&limit=20`)
      if (!alive) return
      state.stockItems = data.items || []
      state.stockNote.textContent = `${label || data.symbol} · ${state.stockItems.length} 条`
      annotateAll()
    } catch (err) {
      if (!alive) return
      state.stockError = '加载失败：' + (err && err.message ? err.message : String(err))
      state.stockItems = []
    } finally {
      state.stockLoading = false
      if (alive) paintStock()
    }
  }

  // ---------------------------------------------------------------- 时钟

  function refreshTimes() {
    for (const node of root.querySelectorAll('[data-iso]')) {
      const when = relTime(node.dataset.iso)
      node.textContent = when.text
      node.title = when.full
      node.style.color = when.fresh ? N.fresh : H.body
      node.style.fontWeight = when.fresh ? '600' : '400'
    }
  }

  function schedule() {
    if (timer) { clearInterval(timer); timer = null }
    if (!state.auto) return
    timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (state.tab !== 'feed') return
      refreshTop()
    }, REFRESH_MS)
  }

  clock = setInterval(refreshTimes, 30000)

  // ---------------------------------------------------------------- 启动
  paintTabs()
  paintPanels()
  paintSentimentRow()
  paintMineToggle()
  paintStockChips()
  paintFeed()
  paintStock()
  loadFeed()
  loadMine()
  schedule()

  return () => {
    alive = false
    if (timer) clearInterval(timer)
    if (clock) clearInterval(clock)
    timer = null
    clock = null
    el.innerHTML = ''
  }
}

const extension = {
  id: EXT_ID,
  apiVersion: 1,
  routes: [{ id: 'news', path: PAGE_PATH, mount }],
  navigation: [{ id: 'news', routeId: 'news', label: '财经资讯', icon: 'BookOpen' }],
}

export default extension
