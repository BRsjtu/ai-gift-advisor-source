const { productMatchesCategory } = require('./gift-recommend')

const RESULT_LIMIT = 5
const REQUEST_LIMIT = 10
const SEARCH_TIME_LIMIT = 120000
const PLATFORM_LABELS = { jd: '京东', taobao: '淘宝/天猫', douyin: '抖音电商' }

function money(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function formatMoney(value) {
  return String(Math.round(value * 100) / 100)
}

function getBudgetMatch(product, budget = {}) {
  const price = money(product.price)
  const min = money(budget.minPrice)
  const max = money(budget.maxPrice)
  if (price === null || price === 0) return { status: 'unknown', distance: null, label: '价格待确认' }
  if (min !== null && price < min) {
    const distance = Math.round((min - price) * 100) / 100
    return { status: 'below', distance, label: `低于预算下限 ${formatMoney(distance)} 元` }
  }
  if (max !== null && price > max) {
    const distance = Math.round((price - max) * 100) / 100
    return { status: 'above', distance, label: `超出预算上限 ${formatMoney(distance)} 元` }
  }
  return { status: 'within', distance: 0, label: min === null && max === null ? '' : '预算内' }
}

function productKey(product) {
  const platform = product.searchEvidence && product.searchEvidence.platform || product.platform
  return `${platform}:${product.skuId || product.id || product.detailUrl}`
}

function rankProducts(items, budget, platform) {
  const group = { within: 0, below: 1, above: 1, unknown: 2 }
  const preferred = (item) => item.searchEvidence && item.searchEvidence.platform === platform
  const completeness = (item) => Number(Boolean(item.imageUrl)) + Number(Boolean(item.shopName))
  return items.map((item) => ({ ...item, budgetMatch: getBudgetMatch(item, budget) }))
    .sort((a, b) => group[a.budgetMatch.status] - group[b.budgetMatch.status] ||
      (a.budgetMatch.distance || 0) - (b.budgetMatch.distance || 0) ||
      Number(preferred(b)) - Number(preferred(a)) || completeness(b) - completeness(a))
}

function buildSearchSummary(products, platform) {
  const within = products.filter((item) => item.budgetMatch && item.budgetMatch.status === 'within').length
  const outside = products.filter((item) => item.budgetMatch && ['above', 'below'].includes(item.budgetMatch.status)).length
  const unknown = products.length - within - outside
  const parts = []
  if (outside) parts.push(within ? `${within} 件预算内，另列 ${outside} 件预算外候选` : '暂未找到预算内商品，以下按预算差额排序')
  if (unknown) parts.push(`${unknown} 件价格待确认`)
  const otherPlatforms = [...new Set(products.map((item) => item.searchEvidence && item.searchEvidence.platform)
    .filter((value) => value && value !== platform))]
  if (otherPlatforms.length) parts.push(`含${otherPlatforms.map((value) => PLATFORM_LABELS[value]).join('、')}补充候选`)
  return parts.join('；')
}

function getProductSearchKey(plan) {
  const category = plan.selectedCategory || {}
  return JSON.stringify([plan.id, category.id, category.name, category.keywords, category.matchKeywords,
    plan.draft && plan.draft.budget, plan.draft && plan.draft.platformPreference])
}

async function searchRealProducts({ category, budget, platform, keywords, fetchPage, onProgress, initialState, shouldStop }) {
  const startedAt = Date.now()
  const candidates = new Map()
  const attempts = (initialState && initialState.attempts || []).filter((item) => item.rawCount !== undefined || item.error).map((item) => ({ ...item }))
  const visited = new Map(attempts.map((item) => [item.key, item]))
  const errors = (initialState && initialState.errors || []).slice()
  let terminalFailure = false
  const unavailablePlatforms = new Set()
  const valid = (item) => item && item.title && /^https?:\/\//i.test(item.detailUrl || '') && productMatchesCategory(item, category)
  const previousCandidates = initialState && initialState.candidates || []
  previousCandidates.filter(valid).forEach((item) => candidates.set(productKey(item), item))
  const selected = () => rankProducts([...candidates.values()], budget, platform).slice(0, RESULT_LIMIT)
  const enough = () => selected().filter((item) => item.budgetMatch.status === 'within').length >= RESULT_LIMIT
  const canContinue = () => !terminalFailure && attempts.length < REQUEST_LIMIT && Date.now() - startedAt < SEARCH_TIME_LIMIT && !(shouldStop && shouldStop())
  const snapshot = (status, stage) => {
    const products = selected()
    return {
      products,
      search: {
        status, stage, attempts: attempts.slice(), errors: errors.slice(),
        candidates: rankProducts([...candidates.values()], budget, platform).slice(0, 100),
        candidateCount: candidates.size,
        summary: [buildSearchSummary(products, platform), errors.length && products.length ? '部分检索失败，已保留取得的真实候选' : ''].filter(Boolean).join('；'),
        updatedAt: Date.now(),
      },
    }
  }
  const publish = (status, stage) => {
    const result = snapshot(status, stage)
    if (onProgress) onProgress(result)
    return result
  }
  const run = async (query, stage) => {
    const params = { platform, page: 1, minPrice: budget.minPrice, maxPrice: budget.maxPrice, ...query }
    if (params.platform !== 'taobao') delete params.usePriceFilter
    const key = JSON.stringify(params)
    if (visited.has(key)) return visited.get(key)
    if (!canContinue() || enough() || unavailablePlatforms.has(params.platform)) return null
    const attempt = { key, platform: params.platform, keyword: params.keyword, page: params.page, stage }
    attempts.push(attempt)
    visited.set(key, attempt)
    publish('searching', stage)
    try {
      const response = await fetchPage(params)
      const items = Array.isArray(response.items) ? response.items : []
      attempt.rawCount = response.diagnostics && response.diagnostics.rawItemCount !== undefined
        ? response.diagnostics.rawItemCount : items.length
      attempt.searchId = response.searchId || ''
      attempt.requestId = response.diagnostics && response.diagnostics.requestId || ''
      attempt.matchedCount = 0
      items.filter(valid).forEach((item) => {
        attempt.matchedCount += 1
        const product = { ...item, searchEvidence: {
          ...(item.searchEvidence || {}), platform: params.platform, keyword: params.keyword, page: params.page,
        } }
        const previous = candidates.get(productKey(product))
        // Keep the richer observation when the same SKU appears on multiple pages.
        if (!previous || (money(previous.price) === null && money(product.price) !== null) || (!previous.imageUrl && product.imageUrl)) {
          candidates.set(productKey(product), product)
        }
      })
    } catch (error) {
      attempt.error = error.message || String(error)
      errors.push({ platform: params.platform, keyword: params.keyword, page: params.page, message: attempt.error })
      terminalFailure = /\bcode=(100|303|601|602)\b/.test(attempt.error)
      if (/\bcode=600\b/.test(attempt.error) || errors.filter((item) => item.platform === params.platform).length >= 2) {
        unavailablePlatforms.add(params.platform)
      }
      console.warn('[gift-search] request failed', errors[errors.length - 1])
    }
    publish('searching', stage)
    return attempt
  }

  if (!keywords.length) throw new Error('当前礼物方向缺少搜索关键词，请重新选择礼物方向。')
  // First broaden AI-generated terms, then paginate the most relevant response.
  const firstPages = []
  for (const keyword of keywords.slice(0, 3)) {
    const result = await run({ keyword }, '正在寻找预算内商品')
    if (result) firstPages.push(result)
    if (enough() || !canContinue()) break
  }
  if (!enough() && canContinue()) {
    const best = firstPages.filter((item) => item.rawCount > 0 && !item.error)
      .sort((a, b) => (b.matchedCount || 0) - (a.matchedCount || 0))[0]
    if (best && (platform !== 'douyin' || best.searchId)) {
      await run({ keyword: best.keyword, page: 2, searchId: best.searchId }, '正在查看更多商品')
    }
  }

  const broadKeyword = keywords[keywords.length - 1]
  if (!enough() && canContinue() && platform === 'taobao') {
    if (money(budget.minPrice) !== null) {
      await run({ keyword: keywords[0], minPrice: null, maxPrice: budget.minPrice, sort: '_bid' }, '正在比较预算附近商品')
    }
    if (money(budget.maxPrice) !== null) {
      await run({ keyword: keywords[0], minPrice: budget.maxPrice, maxPrice: null, sort: 'bid' }, '正在比较预算附近商品')
    }
    if (money(budget.minPrice) !== null || money(budget.maxPrice) !== null) {
      await run({
        keyword: keywords[0],
        minPrice: money(budget.minPrice) === null ? null : Math.floor(budget.minPrice * 0.7),
        maxPrice: money(budget.maxPrice) === null ? null : Math.ceil(budget.maxPrice * 1.3),
      }, '正在检索邻近价位')
    }
  }
  if (!enough() && canContinue() && (platform !== 'taobao' || candidates.size < RESULT_LIMIT)) {
    await run({ keyword: broadKeyword, usePriceFilter: false }, '正在扩大商品检索范围')
  }
  // Platform is a preference. Only supplement elsewhere when it cannot fill the list.
  for (const alternative of Object.keys(PLATFORM_LABELS).filter((value) => value !== platform)) {
    if (selected().filter((item) => item.budgetMatch.status !== 'unknown').length >= RESULT_LIMIT || !canContinue()) break
    await run({ platform: alternative, keyword: broadKeyword, usePriceFilter: false }, `正在查询${PLATFORM_LABELS[alternative]}补充候选`)
  }

  const result = publish('complete', '')
  if (!result.products.length && !(shouldStop && shouldStop())) {
    const error = new Error(errors.length
      ? `本次检索未能取得匹配商品，${errors[errors.length - 1].message}`
      : '已扩展关键词、页数和平台，暂未检索到与该方向匹配的真实商品。请换一个礼物方向或稍后重试。')
    error.search = result.search
    throw error
  }
  return result
}

module.exports = { getBudgetMatch, rankProducts, buildSearchSummary, getProductSearchKey, searchRealProducts }
