const { getCurrentPlan, saveCurrentPlan } = require('../../utils/storage')
const { getEliteIds } = require('../../utils/gift-recommend')
const { getIllustratedCategories, runCategoryImages, retryCategoryImage } = require('../../utils/category-images')

Page({
  data: {
    plan: {},
    advice: '',
    error: '',
    categories: [],
  },

  onShow() {
    this._visible = true
    const plan = getCurrentPlan()
    if (!plan || !plan.profile) {
      wx.redirectTo({
        url: '/pages/profile/profile',
      })
      return
    }
    this.setData({
      plan,
      advice: plan.advice || '',
      categories: getIllustratedCategories(plan),
    })
    this.startIllustrations()
  },

  onHide() { this._visible = false },
  onUnload() { this._visible = false },

  startIllustrations() {
    if (this._imageRun) return
    const plan = this.data.plan
    this._imageRun = runCategoryImages(plan, {
      isActive: () => this._visible && this.data.plan.id === plan.id,
      onUpdate: () => {
        if (this._visible && this.data.plan.id === plan.id) this.setData({ categories: getIllustratedCategories(plan) })
      },
    }).finally(() => {
      this._imageRun = null
      if (!this._visible) return
      const categories = getIllustratedCategories(this.data.plan)
      this.setData({ categories })
      if (categories.some((item) => !item.illustration.path && item.illustration.status !== 'failed')) this.startIllustrations()
    })
  },

  retryIllustration(event) {
    retryCategoryImage(this.data.plan, event.detail)
    this.setData({ categories: getIllustratedCategories(this.data.plan) })
    this.startIllustrations()
  },

  async selectCategory(event) {
    const category = {
      ...event.detail,
      eliteIds: getEliteIds(event.detail),
    }
    const currentPlan = this.data.plan || {}
    const oldCategory = currentPlan.selectedCategory || {}
    const sameCategory = oldCategory.id === category.id || oldCategory.name === category.name
    const plan = {
      ...currentPlan,
      selectedCategory: category,
      products: sameCategory ? (currentPlan.products || []) : [],
      productSearch: sameCategory ? (currentPlan.productSearch || null) : null,
      selectedProduct: sameCategory ? (currentPlan.selectedProduct || null) : null,
      guide: sameCategory ? (currentPlan.guide || null) : null,
    }
    saveCurrentPlan(plan)
    this.setData({ plan, error: '' })
    wx.navigateTo({
      url: '/pages/gift-guide/gift-guide',
    })
  },
})
