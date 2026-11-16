/**
 * 财经资讯页面插件（Page Pack SDK v1）
 *
 * 自包含单文件 ES 模块，零构建：原生 DOM。
 * 数据来自配套后端 /api/extensions/nasvip.news/*（同源 fetch，自动带登录态）。
 */

const EXT_ID = 'nasvip.news'
const BASE = '/api/extensions/' + EXT_ID
const REFRESH_MS = 30000
const PAGE_PATH = '/news'

const TONE = {
  bullish: { color: '#e5484d', label: '利好' },
  bearish: { color: '#2ea043', label: '利空' },
  neutral: { color: '#8b8b93', label: '中性' },
}

const V = {
  text: 'var(--text, inherit)',
  muted: 'var(--muted, #8b8b93)',
  line: 'var(--line, rgba(125,125,125,0.22))',
  card: 'var(--card, rgba(125,125,125,0.05))',
  accent: 'var(--accent, #3b82f6)',
  danger: 'var(--danger, #ef4444)',
}

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
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
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

/** '2026-11-16 11:58:33' -> '2026/11/16 11:58:33'（跟面板资讯页一致的斜杠格式） */
function fmtTime(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.replace(/^(\d{4})-(\d{2})-(\d{2})/, '$1/$2/$3')
}

function openUrl(url) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function styleCard(hovered) {
  return {
    border: '1px solid ' + (hovered ? 'rgba(125,125,125,0.45)' : V.line),
    background: V.card,
    borderRadius: '10px',
    padding: '14px 16px',
    transition: 'border-color 0.15s ease, background 0.15s ease',
  }
}

function sentimentBadge(item) {
  const tone = TONE[item.sentiment] || TONE.neutral
  return h(
    'span',
    {
      style: {
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        color: tone.color, fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap',
      },
    },
    h('span', {
      style: { width: '6px', height: '6px', borderRadius: '50%', background: tone.color },
    }),
    tone.label,
  )
}

function kindBadge(item) {
  const hasUrl = Boolean(item.url)
  return h('span', {
    text: hasUrl ? '原文' : '仅摘要',
    style: {
      fontSize: '11.5px', color: V.muted, border: '1px solid ' + V.line,
      borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap',
    },
  })
}

function topicChips(topics) {
  return (topics || []).map((name) =>
    h('span', {
      text: name,
      style: {
        fontSize: '11.5px', color: V.muted, background: 'rgba(125,125,125,0.10)',
        border: '1px solid ' + V.line, borderRadius: '4px', padding: '1px 7px',
        whiteSpace: 'nowrap',
      },
    }),
  )
}

function buildCard(item) {
  const link = item.url
    ? h('span', {
        text: '↗',
        title: '打开原文',
        style: { color: V.muted, fontSize: '13px', cursor: 'pointer', flex: '0 0 auto', paddingLeft: '8px' },
        onclick: (e) => {
          e.stopPropagation()
          openUrl(item.url)
        },
      })
    : null

  const title = h('div', {
    text: item.title,
    style: {
      color: V.text, fontSize: '14px', fontWeight: '600', lineHeight: '1.5',
      flex: '1 1 auto', minWidth: '0', cursor: item.url ? 'pointer' : 'default',
    },
    onclick: item.url ? () => openUrl(item.url) : undefined,
  })

  const summary = item.summary
    ? h('div', {
        text: item.summary,
        style: {
          color: V.muted, fontSize: '12.5px', lineHeight: '1.75', marginTop: '8px',
          display: '-webkit-box', WebkitLineClamp: '3', WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
      })
    : null

  const footer = h(
    'div',
    {
      style: {
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        marginTop: '10px', fontSize: '11.5px', color: V.muted,
      },
    },
    h('span', { text: item.source || '', style: { color: V.muted } }),
    h('span', { text: fmtTime(item.time) }),
    ...topicChips(item.topics),
  )

  const card = h(
    'article',
    { style: styleCard(false) },
    h(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      sentimentBadge(item),
      kindBadge(item),
      title,
      link,
    ),
    summary,
    footer,
  )

  card.addEventListener('mouseenter', () => Object.assign(card.style, styleCard(true)))
  card.addEventListener('mouseleave', () => Object.assign(card.style, styleCard(false)))
  return card
}

function mount(el, ctx) {
  const state = {
    tab: 'feed',
    keyword: '',
    topic: '',
    sentiment: '',
    auto: true,
    loading: false,
    error: '',
    items: [],
    total: 0,
    stats: { bullish: 0, bearish: 0, neutral: 0 },
    topics: [],
    symbol: '',
    stockItems: [],
    stockLoading: false,
    stockError: '',
  }
  let alive = true
  let timer = null

  el.innerHTML = ''
  const root = h('div', {
    style: { maxWidth: '1080px', margin: '0 auto', padding: '18px 20px 60px' },
  })
  el.append(root)

  // ---------------- 头部 ----------------
  const tabs = h('div', { style: { display: 'flex', gap: '8px' } })
  const statusText = h('div', { style: { color: V.muted, fontSize: '12px', marginLeft: 'auto' } })
  const header = h(
    'div',
    { style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' } },
    h('div', { text: '财经资讯', style: { fontSize: '18px', fontWeight: '700', color: V.text } }),
    tabs,
    statusText,
  )

  // ---------------- 工具条 ----------------
  const searchInput = h('input', {
    type: 'search',
    placeholder: '搜索标题或摘要',
    oninput: (e) => {
      state.keyword = e.target.value.trim()
      paintFeed()
    },
    style: {
      flex: '1 1 200px', minWidth: '160px', height: '32px', padding: '0 10px',
      borderRadius: '8px', border: '1px solid ' + V.line, background: 'transparent',
      color: V.text, fontSize: '13px', outline: 'none',
    },
  })
  const autoBox = h('input', {
    type: 'checkbox',
    checked: true,
    onchange: (e) => {
      state.auto = e.target.checked
      schedule()
    },
  })
  const autoLabel = h(
    'label',
    { style: { display: 'flex', alignItems: 'center', gap: '6px', color: V.muted, fontSize: '12.5px', cursor: 'pointer' } },
    autoBox,
    document.createTextNode('自动刷新'),
  )
  const refreshBtn = h('button', {
    text: '刷新',
    onclick: () => loadFeed(true),
    style: {
      height: '32px', padding: '0 14px', borderRadius: '8px', border: '1px solid ' + V.line,
      background: 'transparent', color: V.text, fontSize: '13px', cursor: 'pointer',
    },
  })
  const toolRow = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
    searchInput, autoLabel, refreshBtn)

  const sentimentRow = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' } })
  const topicRow = h('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' },
  })

  const feedList = h('div', { style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' } })
  const feedPanel = h('div', {}, toolRow, sentimentRow, topicRow, feedList)

  // ---------------- 个股 ----------------
  const symbolInput = h('input', {
    type: 'text',
    placeholder: '输入股票代码，如 600519 或 600519.SH',
    oninput: (e) => { state.symbol = e.target.value.trim() },
    onkeydown: (e) => { if (e.key === 'Enter') loadStock() },
    style: {
      width: '280px', height: '32px', padding: '0 10px', borderRadius: '8px',
      border: '1px solid ' + V.line, background: 'transparent', color: V.text,
      fontSize: '13px', outline: 'none',
    },
  })
  const stockBtn = h('button', {
    text: '查询',
    onclick: () => loadStock(),
    style: {
      height: '32px', padding: '0 16px', borderRadius: '8px', border: 'none',
      background: V.accent, color: '#fff', fontSize: '13px', cursor: 'pointer',
    },
  })
  const stockHead = h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, symbolInput, stockBtn)
  const stockList = h('div', { style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' } })
  const stockPanel = h('div', { style: { display: 'none' } }, stockHead, stockList)

  root.append(header, feedPanel, stockPanel)

  // ---------------- 渲染 ----------------
  function chip(label, active, onClick, activeColor) {
    return h('button', {
      text: label,
      onclick: onClick,
      style: {
        height: '26px', padding: '0 10px', borderRadius: '6px', cursor: 'pointer',
        fontSize: '12px',
        border: '1px solid ' + (active ? (activeColor || V.accent) : V.line),
        background: active ? 'rgba(125,125,125,0.14)' : 'transparent',
        color: active ? (activeColor || V.accent) : V.text,
      },
    })
  }

  function paintTabs() {
    tabs.textContent = ''
    tabs.append(
      chip('7x24 快讯', state.tab === 'feed', () => {
        state.tab = 'feed'
        paintTabs()
        paintPanels()
        loadFeed()
      }),
      chip('个股新闻', state.tab === 'stock', () => {
        state.tab = 'stock'
        paintTabs()
        paintPanels()
      }),
    )
  }

  function paintPanels() {
    feedPanel.style.display = state.tab === 'feed' ? '' : 'none'
    stockPanel.style.display = state.tab === 'stock' ? '' : 'none'
  }

  function paintSentimentRow() {
    sentimentRow.textContent = ''
    const options = [
      ['', '全部'],
      ['bullish', '利好'],
      ['bearish', '利空'],
    ]
    for (const [key, label] of options) {
      const tone = key ? TONE[key] : null
      sentimentRow.append(
        chip(label, state.sentiment === key, () => {
          state.sentiment = key
          paintSentimentRow()
          loadFeed(true)
        }, tone ? tone.color : undefined),
      )
    }
    if (state.stats.bullish || state.stats.bearish) {
      sentimentRow.append(
        h('span', {
          text: `利好 ${state.stats.bullish} · 利空 ${state.stats.bearish} · 中性 ${state.stats.neutral}`,
          style: { color: V.muted, fontSize: '11.5px', marginLeft: '4px', alignSelf: 'center' },
        }),
      )
    }
  }

  function paintTopicRow() {
    topicRow.textContent = ''
    if (!state.topics.length) return
    topicRow.append(
      chip('全部主题', state.topic === '', () => {
        state.topic = ''
        paintTopicRow()
        loadFeed(true)
      }),
    )
    for (const entry of state.topics.slice(0, 16)) {
      topicRow.append(
        chip(`${entry.name} ${entry.count}`, state.topic === entry.name, () => {
          state.topic = entry.name
          paintTopicRow()
          loadFeed(true)
        }),
      )
    }
  }

  function status(text, tone) {
    statusText.textContent = text || ''
    statusText.style.color = tone === 'error' ? V.danger : V.muted
  }

  function paintFeed() {
    feedList.textContent = ''
    if (state.error) {
      feedList.append(h('div', { text: state.error, style: { color: V.danger, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (state.loading && !state.items.length) {
      feedList.append(h('div', { text: '加载中…', style: { color: V.muted, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    const kw = state.keyword.toLowerCase()
    const items = kw
      ? state.items.filter((it) =>
          (it.title || '').toLowerCase().includes(kw) || (it.summary || '').toLowerCase().includes(kw))
      : state.items
    if (!items.length) {
      feedList.append(h('div', {
        text: kw ? '没有匹配的条目' : '暂无数据',
        style: { color: V.muted, fontSize: '13px', padding: '16px 4px' },
      }))
      return
    }
    for (const item of items) feedList.append(buildCard(item))
    if (kw) {
      feedList.append(h('div', {
        text: `匹配 ${items.length} / ${state.items.length} 条`,
        style: { color: V.muted, fontSize: '12px', padding: '6px 2px' },
      }))
    }
  }

  function paintStock() {
    stockList.textContent = ''
    if (state.stockError) {
      stockList.append(h('div', { text: state.stockError, style: { color: V.danger, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (state.stockLoading) {
      stockList.append(h('div', { text: '加载中…', style: { color: V.muted, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (!state.stockItems.length) {
      stockList.append(h('div', {
        text: '输入代码后回车或点查询',
        style: { color: V.muted, fontSize: '13px', padding: '16px 4px' },
      }))
      return
    }
    if (ctx.ui?.openStockPreview) {
      stockList.append(h('button', {
        text: '查看该股行情 →',
        onclick: () => ctx.ui.openStockPreview({ symbol: state.symbol }),
        style: {
          alignSelf: 'flex-start', height: '28px', padding: '0 12px', borderRadius: '6px',
          border: '1px solid ' + V.line, background: 'transparent', color: V.accent,
          fontSize: '12.5px', cursor: 'pointer', marginBottom: '2px',
        },
      }))
    }
    for (const item of state.stockItems) stockList.append(buildCard(item))
  }

  // ---------------- 加载 ----------------
  async function loadFeed(force = false) {
    if (state.loading && !force) return
    state.loading = true
    state.error = ''
    if (force) paintFeed()
    status('加载中…')
    try {
      const qs = new URLSearchParams()
      if (state.topic) qs.set('topic', state.topic)
      if (state.sentiment) qs.set('sentiment', state.sentiment)
      qs.set('limit', '50')
      const data = await getJSON('/feed?' + qs.toString())
      if (!alive) return
      state.items = data.items || []
      state.total = data.total || state.items.length
      state.stats = data.stats || state.stats
      state.topics = data.topics || []
      state.error = ''
      paintSentimentRow()
      paintTopicRow()
      const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      const label = (state.topic || state.sentiment)
        ? `显示 ${state.items.length} / 共 ${state.total} 条`
        : `共 ${state.items.length} 条`
      status(`${label} · ${stamp}`)
    } catch (err) {
      if (!alive) return
      state.error = '加载失败：' + (err && err.message ? err.message : String(err))
      state.items = []
      status('加载失败', 'error')
    } finally {
      state.loading = false
      if (alive) paintFeed()
    }
  }

  async function loadStock() {
    const symbol = (state.symbol || symbolInput.value || '').trim()
    if (!symbol) {
      symbolInput.focus()
      return
    }
    state.symbol = symbol
    state.stockLoading = true
    state.stockError = ''
    paintStock()
    try {
      const data = await getJSON(`/stock?symbol=${encodeURIComponent(symbol)}&limit=30`)
      if (!alive) return
      state.stockItems = data.items || []
      state.symbol = data.symbol || symbol
    } catch (err) {
      if (!alive) return
      state.stockError = '加载失败：' + (err && err.message ? err.message : String(err))
      state.stockItems = []
    } finally {
      state.stockLoading = false
      if (alive) paintStock()
    }
  }

  function schedule() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!state.auto) return
    timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (state.tab !== 'feed') return
      loadFeed()
    }, REFRESH_MS)
  }

  // ---------------- 启动 ----------------
  paintTabs()
  paintPanels()
  paintSentimentRow()
  paintFeed()
  paintStock()
  loadFeed()
  schedule()

  return () => {
    alive = false
    if (timer) clearInterval(timer)
    timer = null
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
