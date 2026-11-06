const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getEliteIds,
  normalizeCategories,
  normalizeProfile,
  productMatchesCategory,
  getDynamicMatchKeywords,
  resolveCategoryProfile,
  safeJsonFromText,
} = require('../utils/gift-recommend')
const { buildGuidePrompt } = require('../utils/gift-guide')
const {
  buildJdKeyword,
  buildPlatformSearchKeywords,
  detectPlatform,
  isProductDetailUrl,
  isTrustedImageUrl,
  normalizeWebProduct,
  buildProductOpenUrl,
  buildJdMiniProgramTarget,
  parseBudgetRange,
} = require('../utils/web-products')

test('safeJsonFromText parses fenced json', () => {
  const value = safeJsonFromText('```json\n{"ok":true}\n```')
  assert.equal(value.ok, true)
})

test('normalizeCategories keeps usable defaults', () => {
  const list = normalizeCategories([{ name: '香氛礼盒' }])
  assert.equal(list[0].name, '香氛礼盒')
  assert.deepEqual(list[0].keywords, ['香氛礼盒'])
  assert.deepEqual(list[0].matchKeywords, [])
})

test('dynamic AI categories reject unrelated products using generated match keywords', () => {
  const category = {
    name: '儿童绘画工具礼盒',
    keywords: ['儿童绘画工具礼盒', '无毒可水洗水彩笔套装'],
    matchKeywords: ['绘画', '画笔', '水彩笔', '马克笔'],
  }
  assert.deepEqual(getDynamicMatchKeywords(category), ['绘画', '画笔', '水彩笔', '马克笔'])
  assert.equal(productMatchesCategory({ title: '儿童水彩笔绘画套装' }, category), true)
  assert.equal(productMatchesCategory({ title: '儿童生日零食大礼包' }, category), false)
})

test('normalizeProfile requires real summary', () => {
  assert.throws(() => normalizeProfile({}), /送礼画像/)
})

test('coffee cup category resolves without falling back to unrelated ink products', () => {
  const category = { name: '咖啡杯/随行杯/马克杯', keywords: ['咖啡杯', '随行杯'] }
  assert.equal(resolveCategoryProfile(category).name, '杯具/咖啡周边礼物')
  assert.deepEqual(getEliteIds(category), [1, 22, 30])
  assert.equal(productMatchesCategory({ title: '陶瓷马克杯咖啡杯礼盒' }, category), true)
  assert.equal(productMatchesCategory({ title: '百乐彩色墨水钢笔吸墨器' }, category), false)
})

test('web search products normalize platform price and source', () => {
  assert.equal(detectPlatform('https://item.jd.com/100.html'), '京东')
  assert.equal(detectPlatform('https://detail.tmall.com/item.htm?id=1'), '天猫')
  assert.equal(isProductDetailUrl('https://item.jd.com/100.html'), true)
  assert.equal(isProductDetailUrl('https://www.amazon.com/s?k=mug'), false)
  assert.equal(isProductDetailUrl('https://search.jd.com/Search?keyword=mug'), false)
  assert.equal(isTrustedImageUrl('https://img14.360buyimg.com/n1/test.png'), true)
  assert.equal(isTrustedImageUrl('https://example.com/test.png'), false)
  const product = normalizeWebProduct({
    name: '陶瓷马克杯',
    url: 'https://item.jd.com/100.html',
    imageUrl: 'https://img14.360buyimg.com/n1/test.png',
    priceHint: '59-79元',
  }, {}, { name: '咖啡杯/随行杯/马克杯' }, 0)
  assert.equal(product.source, 'gpt-web-search')
  assert.equal(product.platform, '京东')
  assert.equal(product.imageUrl, 'https://img14.360buyimg.com/n1/test.png')
  assert.equal(product.priceText, '59-79元')
  assert.deepEqual(parseBudgetRange('100-300元'), { minPrice: 100, maxPrice: 300 })
  assert.deepEqual(parseBudgetRange('500元'), { minPrice: 300, maxPrice: 500 })
  assert.deepEqual(parseBudgetRange('500以内'), { minPrice: null, maxPrice: 500 })
  assert.deepEqual(parseBudgetRange('300以上'), { minPrice: 300, maxPrice: null })
  assert.equal(buildJdKeyword({ name: '咖啡杯/随行杯/马克杯' }), '咖啡杯 随行杯 马克杯')
  assert.deepEqual(buildPlatformSearchKeywords({ name: '精品咖啡礼盒', keywords: ['挂耳咖啡礼盒', '手冲咖啡套装'] }), [
    '精品咖啡礼盒',
    '挂耳咖啡礼盒',
    '手冲咖啡套装',
  ])
  assert.equal(buildProductOpenUrl({ detailUrl: 'https://item.jd.com/100.html' }), 'https://item.m.jd.com/ware/view.action?wareId=100')
  assert.deepEqual(buildJdMiniProgramTarget({ platform: '京东', detailUrl: 'https://item.jd.com/100.html' }), {
    appId: 'touristappid',
    path: '/pages/item/detail/detail?sku=100',
    envVersion: 'release',
  })
})

test('gift guide prompt requests editable blessings', () => {
  const prompt = buildGuidePrompt({
    draft: { relation: '朋友', occasion: '生日', budget: '100-300元', interests: '咖啡' },
    profile: { summary: '喜欢咖啡和桌面布置' },
    selectedCategory: { name: '咖啡礼盒' },
  })
  assert.match(prompt, /blessings/)
  assert.match(prompt, /每条 28 字以内/)
})
