const test = require('node:test')
const assert = require('node:assert/strict')
const { getBudgetMatch, rankProducts, searchRealProducts } = require('../utils/product-search')
const { productMatchesCategory } = require('../utils/gift-recommend')
const { normalizePlatformImageUrl, parseBudgetRange } = require('../utils/web-products')

const category = { name: '首饰收纳盒', keywords: ['首饰收纳盒'], matchKeywords: ['首饰收纳盒', '首饰盒'] }
const budget = { minPrice: 50, maxPrice: 100 }
const product = (id, price, platform = 'taobao') => ({
  id: String(id), skuId: String(id), title: `首饰收纳盒 ${id}`, price,
  detailUrl: `https://item.taobao.com/item.htm?id=${id}`,
  searchEvidence: { platform, requestId: 'test-only' },
})
const run = (fetchPage, extra = {}) => searchRealProducts({
  category, budget, platform: 'taobao', keywords: ['首饰收纳盒', '首饰盒'], fetchPage, ...extra,
})

test('Taobao search image paths preserve the real asset on the working image CDN', () => {
  assert.equal(normalizePlatformImageUrl('https://g.search3.alicdn.com/img/bao/uploaded/i4/i2/123/pic.jpg'), 'https://img.alicdn.com/imgextra/i2/123/pic.jpg')
  assert.equal(normalizePlatformImageUrl('https://g.search.alicdn.com/img/bao/uploaded/i1/123/pic.jpg'), 'https://img.alicdn.com/imgextra/i1/123/pic.jpg')
  assert.equal(normalizePlatformImageUrl('https://example.com/not-a-product.jpg'), '')
})

test('budget distance keeps both limits and unknown prices explicit', () => {
  assert.deepEqual(getBudgetMatch({ price: 25.4 }, budget), { status: 'below', distance: 24.6, label: '低于预算下限 24.6 元' })
  assert.equal(getBudgetMatch({ price: 109 }, budget).label, '超出预算上限 9 元')
  assert.equal(getBudgetMatch({ price: null }, budget).status, 'unknown')
  assert.equal(getBudgetMatch({ price: '' }, budget).status, 'unknown')
  assert.equal(getBudgetMatch({ price: 0 }, budget).status, 'unknown')
  assert.equal(getBudgetMatch({ price: 500 }, { minPrice: 300, maxPrice: null }).status, 'within')
  assert.equal(getBudgetMatch({ price: 20 }, { minPrice: null, maxPrice: 50 }).status, 'within')
  assert.deepEqual(parseBudgetRange('100-50元'), budget)
})

test('in-budget first, then nearest difference, unknown prices last', () => {
  const ranked = rankProducts([product(1, 20), product(2, 105), product(3, null), product(4, 70), product(5, 49)], budget, 'taobao')
  assert.deepEqual(ranked.map((item) => item.id), ['4', '5', '2', '1', '3'])
})

test('regression: ten products under 50 no longer become an empty result', async () => {
  const items = Array.from({ length: 10 }, (_, i) => product(i + 1, 10 + i))
  const result = await run(async () => ({ items }))
  assert.equal(result.products.length, 5)
  assert.deepEqual(result.products.map((item) => item.price), [19, 18, 17, 16, 15])
  assert.ok(result.products.every((item) => item.budgetMatch.status === 'below'))
  assert.match(result.search.summary, /暂未找到预算内/)
  assert.ok(result.search.attempts.length <= 10)
})

test('search stops after one request when five in-budget products exist', async () => {
  let calls = 0
  const result = await run(async () => { calls++; return { items: Array.from({ length: 5 }, (_, i) => product(i, 60 + i)) } })
  assert.equal(calls, 1)
  assert.equal(result.products.length, 5)
})

test('pagination can find the missing budget matches and carries douyin searchId', async () => {
  const calls = []
  const result = await run(async (query) => {
    calls.push(query)
    return query.page === 2
      ? { items: Array.from({ length: 5 }, (_, i) => product(i + 10, 70, 'douyin')) }
      : { items: [product(1, 10, 'douyin')], searchId: 'next-page-token' }
  }, { platform: 'douyin', keywords: ['首饰盒'] })
  assert.equal(calls[1].searchId, 'next-page-token')
  assert.equal(calls[1].page, 2)
  assert.ok(result.products.every((item) => item.budgetMatch.status === 'within'))
})

test('Taobao boundary searches consider both below and above and retain exact prices', async () => {
  const calls = []
  const result = await run(async (query) => {
    calls.push(query)
    if (query.sort === '_bid') return { items: [product(1, 48)] }
    if (query.sort === 'bid') return { items: [product(2, 101)] }
    return { items: [] }
  })
  assert.ok(calls.some((item) => item.sort === '_bid' && item.maxPrice === 50 && item.minPrice === null))
  assert.ok(calls.some((item) => item.sort === 'bid' && item.minPrice === 100 && item.maxPrice === null))
  assert.ok(calls.filter((item) => item.sort).every((item) => item.keyword === '首饰收纳盒'))
  assert.deepEqual(result.products.map((item) => item.price), [101, 48])
})

test('neighboring budget query supplements weak boundary results without changing the user budget', async () => {
  const result = await run(async (query) => ({
    items: query.minPrice === 35 && query.maxPrice === 130 ? [product(2, 101)] : [product(1, 10)],
  }))
  assert.equal(result.products[0].price, 101)
  assert.equal(result.products[0].budgetMatch.label, '超出预算上限 1 元')
  assert.deepEqual(budget, { minPrice: 50, maxPrice: 100 })
})

test('balance failure stops immediately instead of repeating requests for different keywords', async () => {
  let calls = 0
  await assert.rejects(run(async () => { calls++; throw new Error('code=601 insufficient balance') }), /code=601/)
  assert.equal(calls, 1)
})

test('empty primary platform can use a different platform with explicit provenance', async () => {
  const result = await run(async (query) => ({
    items: query.platform === 'jd' ? Array.from({ length: 5 }, (_, i) => product(i, 60, 'jd')) : [],
  }))
  assert.equal(result.products.length, 5)
  assert.match(result.search.summary, /京东补充候选/)
  assert.ok(result.products.every((item) => item.searchEvidence.platform === 'jd'))
})

test('later failures do not remove earlier real results; all-failure stays an error', async () => {
  let calls = 0
  const result = await run(async () => {
    if (++calls === 1) return { items: [product(1, 49)] }
    throw new Error('code=301 upstream unavailable')
  })
  assert.equal(result.products[0].price, 49)
  assert.ok(result.search.errors.length > 0)
  assert.match(result.search.summary, /部分检索失败/)
  await assert.rejects(run(async () => { throw new Error('code=601 insufficient balance') }), /code=601/)
  await assert.rejects(run(async () => ({ items: [] })), /暂未检索到/)
})

test('unrelated items and shop-name matches cannot fill the result list', async () => {
  assert.equal(productMatchesCategory({ title: '手机收纳盒', shopName: '首饰盒旗舰店' }, category), false)
  await assert.rejects(run(async () => ({ items: [{ ...product(1, 70), title: '手机收纳盒' }] })), /暂未检索到/)
})

test('partial search state resumes without recharging completed queries', async () => {
  let state
  let stop = false
  await run(async () => ({ items: [product(1, 49)] }), {
    onProgress: (result) => {
      if (result.search.attempts.some((item) => item.rawCount !== undefined)) {
        state = result.search
        stop = true
      }
    }, shouldStop: () => stop,
  })
  const requests = []
  const result = await run(async (query) => {
    requests.push(query)
    return { items: Array.from({ length: 5 }, (_, i) => product(10 + i, 60)) }
  }, { initialState: JSON.parse(JSON.stringify(state)) })
  assert.notEqual(requests[0].keyword, '首饰收纳盒')
  assert.equal(result.products.length, 5)
})
