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

// ---------------------------------------------------------------- 配色

const TONE = {
  bullish: { color: '#e5484d', text: '#ff6b70', bg: 'rgba(229,72,77,.14)', bd: 'rgba(229,72,77,.30)', label: '利好' },
  bearish: { color: '#2ea043', text: '#4ec97e', bg: 'rgba(46,160,67,.14)', bd: 'rgba(46,160,67,.30)', label: '利空' },
  neutral: { color: '#d4a72c', text: '#e3b341', bg: 'rgba(212,167,44,.10)', bd: 'rgba(212,167,44,.24)', label: '中性' },
}

// 主题按大类上色，前端不再自己判断分组，直接用后端给的 group
const GROUP = {
  tech: { text: '#6cb6ff', bg: 'rgba(74,158,255,.12)', bd: 'rgba(74,158,255,.26)' },
  consume: { text: '#ffab85', bg: 'rgba(255,139,97,.12)', bd: 'rgba(255,139,97,.26)' },
  cycle: { text: '#d4b13f', bg: 'rgba(212,177,63,.12)', bd: 'rgba(212,177,63,.26)' },
  finance: { text: '#bfa0ff', bg: 'rgba(191,160,255,.12)', bd: 'rgba(191,160,255,.26)' },
  other: { text: '#52c7b8', bg: 'rgba(82,199,184,.12)', bd: 'rgba(82,199,184,.26)' },
}

const SOURCE_COLOR = { em: '#ff9d6b', ths: '#5aa9ff', sina: '#b891f5' }
const SRC_FALLBACK = '#8fb4c9'

const V = {
  text: 'var(--text, #ececf0)',
  body: '#9a9aa3',
  line: 'var(--line, rgba(125,125,125,0.22))',
  card: 'var(--card, rgba(125,125,125,0.05))',
  accent: 'var(--accent, #3b82f6)',
  danger: 'var(--danger, #ef4444)',
  time: '#c2c2ca',
  kindFull: '#8ab4f8',
  kindSum: '#e0a03a',
  mine: '#ff7ac6',
}

// ---------------------------------------------------------------- 基础

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

/** '2026-11-16 12:18:17' -> { text:'12:18', full:'2026/11/16 12:18:17' } */
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
  if (moment.toDateString() === now.toDateString()) {
    return { text: `${m[4]}:${m[5]}`, full, fresh: false }
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (moment.toDateString() === yesterday.toDateString()) {
    return { text: `昨天 ${m[4]}:${m[5]}`, full, fresh: false }
  }
  if (+m[1] === now.getFullYear()) {
    return { text: `${m[2]}/${m[3]} ${m[4]}:${m[5]}`, full, fresh: false }
  }
  return { text: `${m[1]}/${m[2]}/${m[3]}`, full, fresh: false }
}

function openUrl(url) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

// ---------------------------------------------------------------- 组件

function sentimentPill(item) {
  const tone = TONE[item.sentiment] || TONE.neutral
  return h(
    'span',
    {
      style: {
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        fontSize: '11.5px', fontWeight: '600', padding: '2px 8px', borderRadius: '5px',
        color: tone.text, background: tone.bg, border: '1px solid ' + tone.bd,
        whiteSpace: 'nowrap', flex: '0 0 auto',
      },
    },
    h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: tone.color } }),
    tone.label,
  )
}

function kindBadge(item) {
  const hasUrl = Boolean(item.url)
  return h('span', {
    text: hasUrl ? '原文' : '仅摘要',
    style: {
      fontSize: '10.5px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px',
      color: hasUrl ? V.kindFull : V.kindSum,
      background: hasUrl ? 'rgba(138,180,248,.13)' : 'rgba(224,160,58,.13)',
      border: '1px solid ' + (hasUrl ? 'rgba(138,180,248,.28)' : 'rgba(224,160,58,.28)'),
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
      color: GROUP.other.text, background: 'rgba(82,199,184,.10)',
      border: '1px dashed rgba(82,199,184,.38)', whiteSpace: 'nowrap',
    },
  })
}

function mineBadge(kinds) {
  const text = kinds.has('hold') ? '持仓' : '自选'
  return h('span', {
    text,
    style: {
      fontSize: '10.5px', fontWeight: '600', padding: '1px 7px', borderRadius: '4px',
      color: V.mine, background: 'rgba(255,122,198,.12)',
      border: '1px solid rgba(255,122,198,.30)', whiteSpace: 'nowrap',
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
      color: time.fresh ? '#e3b341' : V.time,
      fontWeight: time.fresh ? '600' : '400',
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
    },
  })

  const title = h('span', {
    text: item.title,
    style: {
      color: V.text, fontSize: '14px', fontWeight: '600', lineHeight: '1.5',
      flex: '1 1 auto', minWidth: '0', cursor: item.url ? 'pointer' : 'default',
    },
    onclick: item.url ? () => openUrl(item.url) : undefined,
  })

  const arrow = item.url
    ? h('span', {
        text: '↗', title: '打开原文',
        style: { color: V.kindFull, fontSize: '12px', cursor: 'pointer', flex: '0 0 auto' },
        onclick: (e) => { e.stopPropagation(); openUrl(item.url) },
      })
    : null

  const summary = item.summary
    ? h('div', {
        text: item.summary,
        style: {
          color: V.body, fontSize: '12.5px', lineHeight: '1.7', marginTop: '6px',
          display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        },
      })
    : null

  const foot = [
    h('span', {
      text: item.source || '',
      style: { color: SOURCE_COLOR[item.source_key] || SRC_FALLBACK, fontWeight: '600' },
    }),
    timeNode,
    ...(item.topics || []).map(topicChip),
    item.sectorNames?.length ? sectorChip(item.sectorNames) : null,
    item.mineKinds?.size ? mineBadge(item.mineKinds) : null,
  ].filter(Boolean)

  const card = h(
    'article',
    {
      style: {
        border: '1px solid ' + V.line, background: V.card, borderRadius: '10px',
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
    }, foot),
  )

  card.addEventListener('mouseenter', () => { card.style.borderColor = 'rgba(125,125,125,0.45)' })
  card.addEventListener('mouseleave', () => { card.style.borderColor = V.line })
  return card
}

// ---------------------------------------------------------------- 页面

function mount(el, ctx) {
  const state = {
    tab: 'feed',
    keyword: '',
    topic: '',
    sentiment: '',
    onlyMine: false,
    auto: true,
    loading: false,
    error: '',
    items: [],
    total: 0,
    stats: { bullish: 0, bearish: 0, neutral: 0 },
    topics: [],
    mine: { ready: false, list: [], sectors: [], symbols: new Set() },
    symbol: '',
    stockItems: [],
    stockLoading: false,
    stockError: '',
  }
  let alive = true
  let timer = null
  let clock = null

  el.innerHTML = ''
  const root = h('div', {
    style: { maxWidth: '1080px', margin: '0 auto', padding: '18px 20px 60px' },
  })
  el.append(root)

  // ---- 头部 ----
  const tabs = h('div', { style: { display: 'flex', gap: '8px' } })
  const statusText = h('div', { style: { color: V.body, fontSize: '12px', marginLeft: 'auto' } })
  const header = h('div', {
    style: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' },
  }, h('div', { text: '财经资讯', style: { fontSize: '18px', fontWeight: '700', color: V.text } }), tabs, statusText)

  // ---- 工具条 ----
  const searchInput = h('input', {
    type: 'search',
    placeholder: '搜索标题或摘要',
    oninput: (e) => { state.keyword = e.target.value.trim(); paintFeed() },
    style: {
      flex: '1 1 200px', minWidth: '150px', height: '32px', padding: '0 10px',
      borderRadius: '8px', border: '1px solid ' + V.line, background: 'transparent',
      color: V.text, fontSize: '13px', outline: 'none',
    },
  })

  const mineToggle = h('button', {
    text: '只看我的',
    title: '只看命中自选股或持仓的新闻',
    onclick: () => {
      state.onlyMine = !state.onlyMine
      paintMineToggle()
      paintFeed()
    },
    style: {},
  })
  function paintMineToggle() {
    mineToggle.textContent = state.mine.ready
      ? `只看我的 · ${state.mine.list.length}`
      : '只看我的'
    Object.assign(mineToggle.style, {
      height: '32px', padding: '0 12px', borderRadius: '8px', cursor: 'pointer',
      fontSize: '12.5px',
      border: '1px solid ' + (state.onlyMine ? 'rgba(255,122,198,.55)' : V.line),
      background: state.onlyMine ? 'rgba(255,122,198,.14)' : 'transparent',
      color: state.onlyMine ? V.mine : V.text,
    })
  }

  const autoBox = h('input', {
    type: 'checkbox', checked: true,
    onchange: (e) => { state.auto = e.target.checked; schedule() },
  })
  const autoLabel = h('label', {
    style: { display: 'flex', alignItems: 'center', gap: '6px', color: V.body, fontSize: '12.5px', cursor: 'pointer' },
  }, autoBox, document.createTextNode('自动刷新'))

  const refreshBtn = h('button', {
    text: '刷新',
    onclick: () => loadFeed(true),
    style: {
      height: '32px', padding: '0 14px', borderRadius: '8px', border: '1px solid ' + V.line,
      background: 'transparent', color: V.text, fontSize: '13px', cursor: 'pointer',
    },
  })

  const toolRow = h('div', {
    style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  }, searchInput, mineToggle, autoLabel, refreshBtn)

  const sentimentRow = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' } })
  const topicRow = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } })
  const feedList = h('div', {
    style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '9px' },
  })
  const feedPanel = h('div', {}, toolRow, sentimentRow, topicRow, feedList)

  // ---- 个股 ----
  const symbolInput = h('input', {
    type: 'text', placeholder: '输入股票代码，如 600519 或 600519.SH',
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
  const stockList = h('div', {
    style: { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '9px' },
  })
  const stockPanel = h('div', { style: { display: 'none' } },
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      symbolInput, stockBtn),
    stockList)

  root.append(header, feedPanel, stockPanel)

  // ---------------------------------------------------------------- 渲染

  function chip(label, active, onClick, activeColor) {
    return h('button', {
      text: label, onclick: onClick,
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
        state.tab = 'feed'; paintTabs(); paintPanels(); loadFeed()
      }),
      chip('个股新闻', state.tab === 'stock', () => {
        state.tab = 'stock'; paintTabs(); paintPanels()
      }),
    )
  }

  function paintPanels() {
    feedPanel.style.display = state.tab === 'feed' ? '' : 'none'
    stockPanel.style.display = state.tab === 'stock' ? '' : 'none'
  }

  function paintSentimentRow() {
    sentimentRow.textContent = ''
    const options = [['', '全部'], ['bullish', '利好'], ['bearish', '利空']]
    for (const [key, label] of options) {
      const tone = key ? TONE[key] : null
      sentimentRow.append(chip(label, state.sentiment === key, () => {
        state.sentiment = key; paintSentimentRow(); loadFeed(true)
      }, tone ? tone.color : undefined))
    }
    if (state.stats.bullish || state.stats.bearish) {
      sentimentRow.append(h('span', {
        text: `利好 ${state.stats.bullish} · 利空 ${state.stats.bearish} · 中性 ${state.stats.neutral}`,
        style: { color: V.body, fontSize: '11.5px', marginLeft: '4px', alignSelf: 'center' },
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

  function status(text, tone) {
    statusText.textContent = text || ''
    statusText.style.color = tone === 'error' ? V.danger : V.body
  }

  function visibleItems() {
    let list = state.items
    if (state.keyword) {
      const kw = state.keyword.toLowerCase()
      list = list.filter((it) =>
        (it.title || '').toLowerCase().includes(kw) || (it.summary || '').toLowerCase().includes(kw))
    }
    if (state.onlyMine) {
      list = list.filter((it) => it.mineKinds?.size)
    }
    return list
  }

  function paintFeed() {
    feedList.textContent = ''
    if (state.error) {
      feedList.append(h('div', { text: state.error, style: { color: V.danger, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (state.loading && !state.items.length) {
      feedList.append(h('div', { text: '加载中…', style: { color: V.body, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    const items = visibleItems()
    if (!items.length) {
      feedList.append(h('div', {
        text: state.onlyMine ? '当前没有命中自选/持仓的新闻' : (state.keyword ? '没有匹配的条目' : '暂无数据'),
        style: { color: V.body, fontSize: '13px', padding: '16px 4px' },
      }))
      return
    }
    for (const item of items) feedList.append(buildCard(item))
    if (state.keyword || state.onlyMine) {
      feedList.append(h('div', {
        text: `显示 ${items.length} / ${state.items.length} 条`,
        style: { color: V.body, fontSize: '12px', padding: '6px 2px' },
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
      stockList.append(h('div', { text: '加载中…', style: { color: V.body, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (!state.stockItems.length) {
      stockList.append(h('div', { text: '输入代码后回车或点查询', style: { color: V.body, fontSize: '13px', padding: '16px 4px' } }))
      return
    }
    if (ctx.ui?.openStockPreview) {
      stockList.append(h('button', {
        text: '查看该股行情 →',
        onclick: () => ctx.ui.openStockPreview({ symbol: state.symbol }),
        style: {
          alignSelf: 'flex-start', height: '28px', padding: '0 12px', borderRadius: '6px',
          border: '1px solid ' + V.line, background: 'transparent', color: V.accent,
          fontSize: '12.5px', cursor: 'pointer',
        },
      }))
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
          symbol: row.symbol,
          code: String(row.symbol).split('.')[0],
          name: row.name || '',
          kinds: new Set(['watch']),
        })
      }
    } catch {
      /* 无自选时忽略 */
    }
    try {
      const acc = await getJSON('/api/paper/accounts')
      for (const account of acc.accounts || []) {
        if (!account?.id) continue
        const pos = await getJSON('/api/paper/positions?account=' + encodeURIComponent(account.id))
        for (const hold of pos.holdings || []) {
          if (!hold?.symbol) continue
          const cur = map.get(hold.symbol) || {
            symbol: hold.symbol,
            code: String(hold.symbol).split('.')[0],
            name: '',
            kinds: new Set(),
          }
          cur.kinds.add('hold')
          map.set(hold.symbol, cur)
        }
      }
    } catch {
      /* 无模拟盘时忽略 */
    }

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
      } catch {
        /* 概念表未启用时忽略 */
      }
      try {
        const hy = await getJSON('/api/ext-data/ext_hy_ths/rows' + qs)
        const row = (hy.rows || [])[0]
        const industry = String(row?.['所属同花顺行业'] || '')
        for (const part of industry.split(/[;]/)) {
          const name = part.trim()
          if (name) sectors.add(name)
        }
      } catch {
        /* 行业表未启用时忽略 */
      }
    }

    state.mine = { ready: true, list: [...map.values()], sectors: [...sectors] }
    paintMineToggle()
    annotateAll()
    paintFeed()
  }

  // ---------------------------------------------------------------- 加载

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
      const data = await getJSON(BASE + '/feed?' + qs.toString())
      if (!alive) return
      state.items = data.items || []
      state.total = data.total || state.items.length
      state.stats = data.stats || state.stats
      state.topics = data.topics || []
      state.error = ''
      annotateAll()
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
    if (!symbol) { symbolInput.focus(); return }
    state.symbol = symbol
    state.stockLoading = true
    state.stockError = ''
    paintStock()
    try {
      const data = await getJSON(`${BASE}/stock?symbol=${encodeURIComponent(symbol)}&limit=30`)
      if (!alive) return
      state.stockItems = data.items || []
      state.symbol = data.symbol || symbol
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

  /** 只刷新时间文字，不重建 DOM，避免打断滚动。 */
  function refreshTimes() {
    for (const node of root.querySelectorAll('[data-iso]')) {
      const when = relTime(node.dataset.iso)
      node.textContent = when.text
      node.title = when.full
      node.style.color = when.fresh ? '#e3b341' : V.time
      node.style.fontWeight = when.fresh ? '600' : '400'
    }
  }

  function schedule() {
    if (timer) { clearInterval(timer); timer = null }
    if (clock) { clearInterval(clock); clock = null }
    if (!state.auto) return
    timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (state.tab !== 'feed') return
      loadFeed()
    }, REFRESH_MS)
  }

  // 相对时间要一直往前走，跟自动刷新开关解耦
  clock = setInterval(refreshTimes, 30000)

  // ---------------------------------------------------------------- 启动
  paintTabs()
  paintPanels()
  paintSentimentRow()
  paintMineToggle()
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
