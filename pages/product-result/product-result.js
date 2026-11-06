const { getCurrentPlan, saveCurrentPlan } = require('../../utils/storage')
const { getPlatformOption, normalizePlatformProduct, parseBudgetRange, searchWebProducts } = require('../../utils/web-products')
const { buildSearchSummary, getProductSearchKey, rankProducts } = require('../../utils/product-search')

const activeSearches = new Map()

Page({
  data: {
    plan: {},
    products: [],
    platformText: '京东',
    loading: false,
    error: '',
    searchSummary: '',
    searchStage: '',
  },

  onLoad() {
    this._disposed = false
  },

  onShow() {
    this.loadProducts()
  },

  onUnload() {
    this._disposed = true
    const task = activeSearches.get(this._searchKey)
    if (task && task.view === this) task.view = null
  },

  async loadProducts(retry = false) {
    const plan = getCurrentPlan()
    if (!plan || !plan.selectedCategory) {
      wx.redirectTo({
        url: '/pages/category-result/category-result',
      })
      return
    }
    const key = getProductSearchKey(plan)
    this._searchKey = key
    const platform = plan.draft && plan.draft.platformPreference || 'jd'
    const products = rankProducts((plan.products || []).map((item) => normalizePlatformProduct(item, plan.profile, plan.selectedCategory, platform)), parseBudgetRange(plan.draft && plan.draft.budget), platform)
    this.setData({
      plan,
      products,
      platformText: getPlatformOption(platform).label,
      loading: false,
      error: '',
      searchSummary: buildSearchSummary(products, platform),
      searchStage: '',
    })
    const existingTask = activeSearches.get(key)
    if (existingTask) {
      existingTask.view = this
      this.setData({ loading: true, searchStage: plan.productSearch && plan.productSearch.stage || '正在继续搜索' })
      return existingTask.promise
    }
    if (!retry && products.length && (!plan.productSearch || plan.productSearch.status === 'complete')) return

    const task = { view: this }
    activeSearches.set(key, task)
    const isCurrent = () => getProductSearchKey(getCurrentPlan()) === key
    const update = ({ products: nextProducts, search }) => {
      if (!isCurrent()) return
      // Merge against the latest plan so later search rounds cannot overwrite a selected gift/card.
      const nextPlan = { ...getCurrentPlan(), products: nextProducts, productSearch: { ...search, contextKey: key } }
      saveCurrentPlan(nextPlan)
      if (task.view && !task.view._disposed) task.view.setData({
        plan: nextPlan, products: nextProducts, loading: search.status === 'searching',
        searchSummary: search.summary || '', searchStage: search.stage || '',
      })
    }
    this.setData({ loading: true, searchStage: '正在寻找预算内商品' })
    task.promise = (async () => {
      try {
        const nextProducts = await searchWebProducts({
          profile: plan.profile,
          category: plan.selectedCategory,
          draft: plan.draft,
          onProgress: update,
          initialState: retry ? { candidates: plan.productSearch && plan.productSearch.candidates || products } : plan.productSearch,
          shouldStop: () => !isCurrent(),
        })
        if (isCurrent()) update({ products: nextProducts, search: {
          ...(getCurrentPlan().productSearch || {}), status: 'complete', stage: '',
          summary: getCurrentPlan().productSearch && getCurrentPlan().productSearch.summary || buildSearchSummary(nextProducts, platform),
        } })
      } catch (error) {
        if (!isCurrent()) return
        const latest = getCurrentPlan()
        saveCurrentPlan({ ...latest, productSearch: { ...(error.search || latest.productSearch || {}), status: 'failed' } })
        if (task.view && !task.view._disposed) task.view.setData({ error: error.message || String(error) })
      } finally {
        activeSearches.delete(key)
        if (task.view && !task.view._disposed) task.view.setData({ loading: false, searchStage: '' })
      }
    })()
    return task.promise
  },

  retrySearch() {
    return this.loadProducts(true)
  },

  openProduct(event) {
    const product = event.detail
    const plan = {
      ...getCurrentPlan(),
      selectedProduct: product,
    }
    saveCurrentPlan(plan)
    wx.navigateTo({
      url: '/pages/plan-detail/plan-detail',
    })
  },
})
