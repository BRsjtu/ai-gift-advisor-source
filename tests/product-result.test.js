const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const searchTools = require('../utils/product-search')
const { normalizePlatformProduct, parseBudgetRange } = require('../utils/web-products')

function setup(search) {
  let plan = {
    id: 'test-plan', selectedCategory: { id: 'cat', name: '首饰盒', matchKeywords: ['首饰盒'] },
    draft: { budget: '50-100元', platformPreference: 'taobao' }, products: [],
  }
  let definition
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/product-result/product-result.js'), 'utf8'), {
    Map,
    Page(value) { definition = value },
    wx: { redirectTo() {}, navigateTo() {} },
    require(name) {
      if (name.endsWith('/storage')) return {
        getCurrentPlan: () => structuredClone(plan),
        saveCurrentPlan: (next) => { plan = structuredClone(next) },
      }
      if (name.endsWith('/web-products')) return { normalizePlatformProduct, parseBudgetRange, getPlatformOption: () => ({ label: '淘宝/天猫' }), searchWebProducts: search }
      if (name.endsWith('/product-search')) return searchTools
      throw new Error(name)
    },
  })
  return {
    getPlan: () => plan,
    setPlan: (value) => { plan = value },
    createPage() {
      const page = { ...definition, data: structuredClone(definition.data), setData(value) { Object.assign(this.data, value) } }
      page.onLoad()
      return page
    },
  }
}
const item = { id: '1', title: '首饰盒', detailUrl: 'https://item.taobao.com/item.htm?id=1', price: 49, budgetMatch: { status: 'below', label: '低于预算下限 1 元' } }

test('partial candidates survive navigation and a later round preserves the selected product and gift card', async () => {
  let options
  let finish
  const env = setup((value) => { options = value; return new Promise((resolve) => { finish = resolve }) })
  const page = env.createPage()
  const pending = page.loadProducts()
  options.onProgress({ products: [item], search: { status: 'searching', candidates: [item], attempts: [] } })
  assert.equal(env.getPlan().products.length, 1)
  assert.equal(page.data.loading, true)
  page.openProduct({ detail: item })
  env.setPlan({ ...env.getPlan(), guide: { cardImageUrl: 'saved-real-image' } })
  finish([item])
  await pending
  assert.equal(env.getPlan().selectedProduct.budgetMatch.status, 'below')
  assert.equal(env.getPlan().guide.cardImageUrl, 'saved-real-image')
  assert.equal(env.getPlan().productSearch.status, 'complete')
})

test('reopening the page attaches to the active search instead of issuing duplicate paid calls', async () => {
  let calls = 0
  let options
  let finish
  const env = setup((value) => { calls++; options = value; return new Promise((resolve) => { finish = resolve }) })
  const first = env.createPage()
  const pending = first.loadProducts()
  first.onUnload()
  const second = env.createPage()
  const reattached = second.loadProducts()
  options.onProgress({ products: [item], search: { status: 'searching', candidates: [item], attempts: [] } })
  assert.equal(second.data.products.length, 1)
  finish([item])
  await pending
  await reattached
  assert.equal(calls, 1)
  assert.equal(second.data.loading, false)
})

test('an old search cannot overwrite a newly selected category', async () => {
  let options
  let finish
  const env = setup((value) => { options = value; return new Promise((resolve) => { finish = resolve }) })
  const page = env.createPage()
  const pending = page.loadProducts()
  env.setPlan({ ...env.getPlan(), selectedCategory: { id: 'other', name: '咖啡杯' }, products: [] })
  assert.equal(options.shouldStop(), true)
  options.onProgress({ products: [item], search: { status: 'searching' } })
  finish([item])
  await pending
  assert.equal(env.getPlan().products.length, 0)
  assert.equal(env.getPlan().selectedCategory.name, '咖啡杯')
})
