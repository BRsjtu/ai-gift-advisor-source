const { requestJson } = require('./api')
const { buildProductReason, getChatText, productMatchesCategory, safeJsonFromText } = require('./gift-recommend')
const { searchRealProducts } = require('./product-search')

function detectPlatform(url, fallback) {
  const value = String(url || '')
  if (/jd\.com|jingfen\.jd\.com/i.test(value)) {
    return '京东'
  }
  if (/taobao\.com|tmall\.com/i.test(value)) {
    return /tmall\.com/i.test(value) ? '天猫' : '淘宝'
  }
  if (/yangkeduo\.com|pinduoduo\.com|pdd\.com/i.test(value)) {
    return '拼多多'
  }
  if (/jinritemai\.com|douyin\.com|ecombdimg\.com/i.test(value)) {
    return '抖音'
  }
  return fallback || '网页'
}

function isProductDetailUrl(url) {
  const value = String(url || '')
  return [
    /https?:\/\/item\.jd\.com\/\d+\.html/i,
    /https?:\/\/item\.m\.jd\.com\/ware\/view\.action\?[^#]*wareId=\d+/i,
    /https?:\/\/detail\.tmall\.com\/item\.htm\?[^#]*id=\d+/i,
    /https?:\/\/item\.taobao\.com\/item\.htm\?[^#]*id=\d+/i,
    /https?:\/\/mobile\.yangkeduo\.com\/goods\.html\?[^#]*goods_id=\d+/i,
    /https?:\/\/[^/]*yangkeduo\.com\/goods\.html\?[^#]*goods_id=\d+/i,
    /https?:\/\/haohuo\.jinritemai\.com\/ecommerce\/trade\/detail\/index\.html\?[^#]*id=\d+/i,
  ].some((pattern) => pattern.test(value))
}

function buildProductOpenUrl(product) {
  const source = String((product && (product.promotionUrl || product.detailUrl)) || '').trim()
  const jdMatch = source.match(/^https?:\/\/item\.jd\.com\/(\d+)\.html(?:[?#].*)?$/i)
  if (jdMatch) {
    return `https://item.m.jd.com/ware/view.action?wareId=${jdMatch[1]}`
  }
  return source
}

function isTrustedImageUrl(url) {
  const value = String(url || '')
  return /^https:\/\/(?:img\d+\.360buyimg\.com|m\.360buyimg\.com|img\d+\.tbcdn\.cn|gw\.alicdn\.com|img\.alicdn\.com|g\.search\d*\.alicdn\.com|img\.pddpic\.com|p\d+-aio\.ecombdimg\.com|[^/]+\.ecombdstatic\.com)\//i.test(value)
}

function normalizePlatformImageUrl(value) {
  const url = String(value || '').replace(
    /^https?:\/\/g\.search\d*\.alicdn\.com\/img\/bao\/uploaded\/(?:i\d+\/)?(i\d+\/)/i,
    'https://img.alicdn.com/imgextra/$1',
  )
  return isTrustedImageUrl(url) ? url : ''
}

const PLATFORM_OPTIONS = {
  jd: { label: '京东', source: 'justone-jd-search' },
  taobao: { label: '淘宝/天猫', source: 'justone-taobao-search' },
  douyin: { label: '抖音电商', source: 'justone-douyin-search' },
}

const JD_MINI_PROGRAM_APP_ID = 'touristappid'

function getJdSkuId(product) {
  const direct = String(product && (product.skuId || product.itemId) || '').trim()
  if (/^\d+$/.test(direct)) return direct
  const url = String(product && (product.detailUrl || product.promotionUrl) || '')
  const match = url.match(/item\.jd\.com\/(\d+)\.html/i)
  return match ? match[1] : ''
}

function buildJdMiniProgramTarget(product) {
  if (detectPlatform(product && (product.detailUrl || product.promotionUrl), product && product.platform) !== '京东') return null
  const sku = getJdSkuId(product)
  if (!sku) return null
  return {
    appId: JD_MINI_PROGRAM_APP_ID,
    path: `/pages/item/detail/detail?sku=${sku}`,
    envVersion: 'release',
  }
}

function getPlatformOption(value) {
  return PLATFORM_OPTIONS[value] || PLATFORM_OPTIONS.jd
}

function normalizePrice(value) {
  const text = String(value || '').trim()
  if (!text) {
    return '以页面为准'
  }
  return /^¥/.test(text) || /元|以页面为准/.test(text) ? text : `约 ${text}`
}

function buildSearchPrompt({ category, profile }) {
  return [
    '请使用联网搜索寻找真实可打开的商品页，给送礼小程序返回商品候选。',
    '必须遵守：',
    '1. 只返回中国电商平台的真实商品详情页 URL，不能编造链接、不能返回搜索结果页、榜单页、文章页或站内搜索页。',
    '2. 商品必须直接匹配礼物类别；如果类别是咖啡杯/随行杯/马克杯，就不能返回墨水、打印耗材、咖啡豆或普通文具。',
    '3. 只允许这些 URL 形态：京东 item.jd.com/数字.html；天猫/淘宝 detail.tmall.com/item.htm?id=数字 或 item.taobao.com/item.htm?id=数字；拼多多 mobile.yangkeduo.com/goods.html?goods_id=数字。',
    '4. 不要返回 Amazon、知乎、小红书、什么值得买、百度、搜索结果页或店铺首页。',
    '5. 尽量选择主图清晰、名称具体、价格大致可判断的商品。',
    '6. 必须尽量返回商品主图 imageUrl，只允许京东 360buyimg、淘宝/天猫 alicdn/tbcdn、拼多多 pddpic 这类真实图片 CDN；如果没有看到图片 URL，不要编造。',
    '7. priceHint 优先写搜索结果或页面里能看到的具体价格/价格区间，例如“¥129”或“约100-300元”；不要只写“以页面为准”，除非完全无法判断。',
    '8. 最多返回 5 个，宁缺毋滥。',
    '输出严格 JSON，不要 Markdown：',
    '{"items":[{"name":"","url":"","platform":"","imageUrl":"","priceHint":"","reason":"","risk":""}]}',
    `礼物类别：${category && category.name ? category.name : '未指定'}`,
    `类别关键词：${JSON.stringify(category && category.keywords ? category.keywords : [])}`,
    `送礼画像：${JSON.stringify(profile || {})}`,
  ].join('\n')
}

function normalizeWebProduct(item, profile, category, index) {
  const url = String(item.url || item.detailUrl || '').trim()
  const title = item.title || item.name || '联网搜索商品候选'
  const imageUrl = isTrustedImageUrl(item.imageUrl) ? item.imageUrl : ''
  return {
    id: url || `web-${index}`,
    platform: detectPlatform(url, item.platform),
    title,
    imageUrl,
    imageList: imageUrl ? [imageUrl] : [],
    detailUrl: url,
    promotionUrl: url,
    priceText: normalizePrice(item.priceHint || item.price || item.priceText),
    shopName: item.shopName || '',
    categoryName: item.categoryName || '',
    reason: item.reason || buildProductReason({ title }, profile, category),
    risk: item.risk || '联网搜索结果可能变化，价格、库存、优惠和配送以商品页面为准。',
    source: 'gpt-web-search',
    detailSummary: item.detailSummary || item.description || '',
    metadataOk: Boolean(item.metadataOk),
    raw: item,
  }
}

function parseBudgetRange(value) {
  const text = String(value || '')
  const numbers = text.match(/\d+(?:\.\d+)?/g) || []
  if (numbers.length >= 2) {
    return {
      minPrice: Math.min(Number(numbers[0]), Number(numbers[1])),
      maxPrice: Math.max(Number(numbers[0]), Number(numbers[1])),
    }
  }
  if (numbers.length === 1) {
    const amount = Number(numbers[0])
    if (/以内|以下|不超过|至多|最高|小于|低于/.test(text)) {
      return {
        minPrice: null,
        maxPrice: amount,
      }
    }
    if (/以上|至少|最低|大于|高于/.test(text)) {
      return {
        minPrice: amount,
        maxPrice: null,
      }
    }
    return {
      minPrice: Math.round(amount * 0.6),
      maxPrice: amount,
    }
  }
  return {
    minPrice: null,
    maxPrice: null,
  }
}

function buildJdKeyword(category) {
  const keywords = category && Array.isArray(category.keywords) ? category.keywords : []
  const raw = keywords.length ? keywords.join(' ') : (category && category.name ? category.name : '礼物')
  return raw.replace(/[\/|、，,]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildPlatformSearchKeywords(category) {
  const values = [category && category.name]
    .concat(category && Array.isArray(category.keywords) ? category.keywords : [])
    .concat(category && Array.isArray(category.matchKeywords) ? category.matchKeywords : [])
    .map((value) => String(value || '').replace(/[\/|、，,]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return values.filter((value, index) => values.indexOf(value) === index).slice(0, 6)
}

function normalizePlatformProduct(item, profile, category, platform) {
  const option = getPlatformOption(platform)
  return {
    ...item,
    platform: item.platform || option.label,
    imageUrl: normalizePlatformImageUrl(item.imageUrl),
    imageList: [...new Set([item.imageUrl].concat(item.imageList || []).map(normalizePlatformImageUrl).filter(Boolean))],
    priceText: normalizePrice(item.priceText || item.price),
    reason: item.reason || buildProductReason(item, profile, category),
    risk: item.risk || `价格、库存、优惠和配送以${option.label}页面为准。`,
    source: item.source || option.source,
  }
}

async function searchPlatformProducts({ category, profile, draft, onProgress, initialState, shouldStop }) {
  const platform = (draft && draft.platformPreference) || 'jd'
  const budget = parseBudgetRange(draft && draft.budget)
  const result = await searchRealProducts({
    category, budget, platform, onProgress, initialState, shouldStop,
    keywords: buildPlatformSearchKeywords(category),
    fetchPage: async (query) => {
      const response = await requestJson({
        path: '/v1/products/search',
        data: {
          ...query,
          includeOutOfBudget: true,
          timeoutMs: 18000,
        },
        timeout: 60000,
      })
      if (response.ok === false || !response.data || !Array.isArray(response.data.items)) {
        throw new Error(`商品接口返回异常：${response.error || '缺少商品列表'}`)
      }
      return {
        ...response.data,
        items: response.data.items.map((item) => normalizePlatformProduct(item, profile, category, query.platform)),
      }
    },
  })
  return result.products
}

async function searchJdProducts(options) {
  return searchPlatformProducts({
    ...(options || {}),
    draft: {
      ...((options && options.draft) || {}),
      platformPreference: 'jd',
    },
  })
}

function extractSearchItems(response) {
  const data = response && response.data ? response.data : response
  if (Array.isArray(data && data.items)) {
    return data.items
  }
  const parsed = safeJsonFromText(getChatText(response))
  return Array.isArray(parsed && parsed.items) ? parsed.items : []
}

async function searchWebProducts({ category, profile, draft, onProgress, initialState, shouldStop }) {
  if (!draft || draft.platformPreference !== 'web') {
    return searchPlatformProducts({ category, profile, draft, onProgress, initialState, shouldStop })
  }

  const prompt = buildSearchPrompt({ category, profile })
  const response = await requestJson({
    path: '/v1/chat',
    data: {
      model: getApp().globalData.webSearchModel || getApp().globalData.aiModel,
      prompt,
      input: prompt,
      webSearch: true,
      enrichUrls: true,
      enrichMaxItems: 8,
      temperature: 0.1,
    },
    timeout: 180000,
  })
  const seen = {}
  const products = extractSearchItems(response)
    .map((item, index) => normalizeWebProduct(item, profile, category, index))
    .filter((item) => item.detailUrl && isProductDetailUrl(item.detailUrl) && !seen[item.detailUrl] && (seen[item.detailUrl] = true))
    .filter((item) => productMatchesCategory(item, category))
    .slice(0, 5)

  if (!products.length) {
    throw new Error('联网搜索没有返回与当前类别直接匹配的京东/淘宝/拼多多商品详情链接。')
  }

  return products
}

module.exports = {
  buildSearchPrompt,
  detectPlatform,
  isProductDetailUrl,
  isTrustedImageUrl,
  parseBudgetRange,
  buildJdKeyword,
  buildPlatformSearchKeywords,
  getPlatformOption,
  buildProductOpenUrl,
  buildJdMiniProgramTarget,
  getJdSkuId,
  normalizeWebProduct,
  normalizePlatformProduct,
  normalizePlatformImageUrl,
  searchPlatformProducts,
  searchJdProducts,
  searchWebProducts,
}
