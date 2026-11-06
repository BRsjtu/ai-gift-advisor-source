const DEFAULT_ELITE_IDS = [1, 22, 30]

const CATEGORY_PROFILES = [
  {
    name: '杯具/咖啡周边礼物',
    eliteIds: [1, 22, 30],
    aliases: ['咖啡杯', '随行杯', '马克杯', '水杯', '杯子', '保温杯', '杯具', '咖啡周边'],
    positiveKeywords: ['咖啡杯', '随行杯', '马克杯', '水杯', '杯子', '杯具', '保温杯', '陶瓷杯', '玻璃杯', '杯碟'],
    negativeKeywords: ['墨水', '墨盒', '硒鼓', '打印', '钢笔', '笔芯', '吸墨', '维修', '耗材'],
    strict: true,
  },
  {
    name: '精品咖啡豆或挂耳礼盒',
    eliteIds: [22, 1, 15],
    aliases: ['咖啡豆', '挂耳咖啡', '咖啡礼盒', '冷萃', '咖啡粉'],
    positiveKeywords: ['咖啡豆', '挂耳', '咖啡粉', '冷萃', '美式咖啡', '拿铁', '咖啡礼盒'],
    negativeKeywords: ['墨水', '墨盒', '硒鼓', '打印'],
    strict: true,
  },
  {
    name: '高颜值文具或桌面效率工具',
    eliteIds: [30, 1, 24],
    aliases: ['文具', '钢笔', '手账', '笔记本', '桌面效率', '学习用品'],
    positiveKeywords: ['文具', '钢笔', '签字笔', '笔记本', '手账', '便签', '台历', '书签', '收纳', '桌面'],
    negativeKeywords: ['墨盒', '硒鼓', '打印机耗材'],
  },
  {
    name: '零食/茶饮礼盒',
    eliteIds: [22, 1, 10],
    aliases: ['零食', '茶饮', '茶叶', '点心', '糕点', '坚果'],
    positiveKeywords: ['零食', '茶', '茶叶', '糕点', '点心', '坚果', '饼干', '礼盒', '巧克力'],
    negativeKeywords: ['墨水', '墨盒', '打印'],
  },
  {
    name: '香氛与生活方式',
    eliteIds: [1, 15, 22],
    aliases: ['香氛', '香薰', '蜡烛', '护手霜', '生活方式'],
    positiveKeywords: ['香氛', '香薰', '蜡烛', '护手霜', '身体乳', '扩香', '精油'],
    negativeKeywords: ['墨水', '墨盒', '打印'],
  },
  {
    name: '实用小家电',
    eliteIds: [15, 24, 22],
    aliases: ['小家电', '电器', '加湿器', '按摩仪', '暖手宝'],
    positiveKeywords: ['小家电', '电器', '加湿器', '按摩', '暖手', '台灯', '吹风机', '电热'],
    negativeKeywords: ['墨水', '墨盒', '打印耗材'],
  },
  {
    name: '办公实用品',
    eliteIds: [24, 1, 30],
    aliases: ['办公', '通勤', '工作', '电脑周边'],
    positiveKeywords: ['办公', '键盘', '鼠标', '支架', '充电', '数据线', '电脑', '靠垫', '台灯'],
    negativeKeywords: [],
  },
  {
    name: '文创摆件',
    eliteIds: [30, 1, 15],
    aliases: ['文创', '摆件', '手办', '装饰', '挂件'],
    positiveKeywords: ['文创', '摆件', '手办', '装饰', '挂件', '盲盒', '模型'],
    negativeKeywords: ['墨水', '墨盒', '打印'],
  },
  {
    name: '桌面摆件或收纳小物',
    eliteIds: [1, 30, 15],
    aliases: ['桌面摆件', '收纳', '桌面小物'],
    positiveKeywords: ['桌面', '摆件', '收纳', '置物', '笔筒', '整理'],
    negativeKeywords: ['墨水', '墨盒', '打印耗材'],
  },
]

function safeJsonFromText(text) {
  if (!text) {
    return null
  }
  if (typeof text === 'object') {
    return text
  }
  const raw = String(text)
  const block = raw.match(/```json\s*([\s\S]*?)```/i)
  const candidate = block ? block[1] : raw.match(/\{[\s\S]*\}/)?.[0]
  if (!candidate) {
    return null
  }
  try {
    return JSON.parse(candidate)
  } catch (_error) {
    return null
  }
}

function getChatText(response) {
  const data = response && response.data ? response.data : response
  if (!data) {
    return ''
  }
  if (typeof data === 'string') {
    return data
  }
  return data.text || data.output_text || data.content || data.message || ''
}

function normalizeCategories(value) {
  const list = Array.isArray(value) ? value : []
  if (!list.length) {
    throw new Error('AI 未返回可用的礼物类别。')
  }
  return list.slice(0, 5).map((item, index) => ({
    id: item.id || `cat-${index}`,
    name: item.name || item.title || '',
    reason: item.reason || item.fitReason || '',
    budgetFit: item.budgetFit || item.budget || '中',
    risk: item.risk || item.warning || '',
    keywords: item.keywords || [item.name || item.title].filter(Boolean),
    matchKeywords: Array.isArray(item.matchKeywords) ? item.matchKeywords.filter(Boolean).slice(0, 8) : [],
  }))
}

function normalizeProfile(value) {
  const profile = value || {}
  if (!profile.summary) {
    throw new Error('AI 未返回可用的送礼画像。')
  }
  return {
    summary: profile.summary,
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    style: profile.style || '',
    stylePoints: Array.isArray(profile.stylePoints) ? profile.stylePoints.filter(Boolean) : [],
    boundaries: profile.boundaries || '',
    boundaryPoints: Array.isArray(profile.boundaryPoints) ? profile.boundaryPoints.filter(Boolean) : [],
    risks: Array.isArray(profile.risks) ? profile.risks : [],
  }
}

function normalizeMatchText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '')
}

function getCategoryText(category) {
  const keywords = category && Array.isArray(category.keywords) ? category.keywords : []
  return normalizeMatchText([
    category && category.name,
    category && category.title,
    keywords.join(' '),
  ].filter(Boolean).join(' '))
}

function hasAnyKeyword(text, keywords) {
  return (keywords || []).some((keyword) => text.indexOf(normalizeMatchText(keyword)) !== -1)
}

const GENERIC_MATCH_WORDS = [
  '高端', '精品', '品牌', '实用', '平价', '创意', '定制', '新款',
  '送礼', '礼物', '礼盒', '套装', '生日', '毕业', '纪念日', '伴手礼',
  '儿童', '男士', '女士', '家用', '专用', '官方', '正品', '可选', '推荐',
]

function getDynamicMatchKeywords(category) {
  const explicit = category && Array.isArray(category.matchKeywords) ? category.matchKeywords : []
  const searchKeywords = category && Array.isArray(category.keywords) ? category.keywords : []
  const sources = explicit.length ? explicit : [category && category.name, ...searchKeywords]
  const candidates = []
  const seen = {}

  sources.filter(Boolean).forEach((source) => {
    let cleaned = normalizeMatchText(source).replace(/[-、，,\/|+·—_或与及]/g, '')
    GENERIC_MATCH_WORDS.forEach((word) => {
      cleaned = cleaned.split(word).join('')
    })
    if (cleaned.length < 2) return

    const values = explicit.length || cleaned.length <= 4
      ? [cleaned]
      : [cleaned].concat(Array.from({ length: Math.max(0, cleaned.length - 1) }, (_, index) => cleaned.slice(index, index + 2)))
    values.forEach((value) => {
      if (value.length >= 2 && !seen[value]) {
        seen[value] = true
        candidates.push(value)
      }
    })
  })

  return candidates.slice(0, 24)
}

function resolveCategoryProfile(category) {
  const text = getCategoryText(category)
  const exact = CATEGORY_PROFILES.find((profile) => normalizeMatchText(profile.name) === text)
  if (exact) {
    return exact
  }
  return CATEGORY_PROFILES.find((profile) => hasAnyKeyword(text, profile.aliases)) || {
    name: category && category.name ? category.name : '通用礼物',
    eliteIds: DEFAULT_ELITE_IDS,
    aliases: [],
    positiveKeywords: [],
    negativeKeywords: [],
    strict: false,
  }
}

function getEliteIds(category) {
  return resolveCategoryProfile(category).eliteIds || DEFAULT_ELITE_IDS
}

function productMatchesCategory(product, category) {
  const profile = resolveCategoryProfile(category)
  const text = normalizeMatchText([
    product && product.title,
    product && product.categoryName,
  ].filter(Boolean).join(' '))
  if (hasAnyKeyword(text, profile.negativeKeywords)) {
    return false
  }
  if (category && Array.isArray(category.matchKeywords) && category.matchKeywords.length) {
    return hasAnyKeyword(text, getDynamicMatchKeywords(category))
  }
  if (!profile.positiveKeywords.length) {
    const dynamicKeywords = getDynamicMatchKeywords(category)
    return !dynamicKeywords.length || hasAnyKeyword(text, dynamicKeywords)
  }
  return hasAnyKeyword(text, profile.positiveKeywords)
}

function buildProductReason(product, profile, category) {
  const interest = profile && profile.interests && profile.interests[0] ? profile.interests[0] : '对方偏好'
  return `${category.name}与${interest}较匹配，可作为送礼候选。实际购买前请确认商品规格、价格、库存和评价。`
}

module.exports = {
  safeJsonFromText,
  getChatText,
  normalizeCategories,
  normalizeProfile,
  getEliteIds,
  getDynamicMatchKeywords,
  resolveCategoryProfile,
  productMatchesCategory,
  buildProductReason,
}
