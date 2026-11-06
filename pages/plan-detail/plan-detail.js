const { addHistory, getCurrentPlan, saveCurrentPlan } = require('../../utils/storage')
const { buildProductOpenUrl, buildJdMiniProgramTarget, normalizePlatformProduct } = require('../../utils/web-products')

Page({
  data: {
    plan: {},
    product: {},
    detail: {
      detailImages: [],
    },
  },

  onLoad() {
    this.loadDetail()
  },

  async loadDetail() {
    const plan = getCurrentPlan()
    const product = plan && plan.selectedProduct
    if (!product) {
      wx.redirectTo({
        url: '/pages/product-result/product-result',
      })
      return
    }
    const normalized = normalizePlatformProduct(product, plan.profile, plan.selectedCategory, plan.draft && plan.draft.platformPreference)
    const nextProduct = {
      ...normalized,
      detailImages: normalized.imageUrl ? [normalized.imageUrl] : [],
    }
    const nextPlan = { ...plan, selectedProduct: nextProduct }
    saveCurrentPlan(nextPlan)
    this.setData({
      plan: nextPlan,
      product: nextProduct,
      detail: { detailImages: nextProduct.detailImages },
    })
  },

  copyLink() {
    const url = buildProductOpenUrl(this.data.product)
    if (!url) {
      wx.showToast({
        title: '没有可复制链接',
        icon: 'none',
      })
      return
    }
    wx.setClipboardData({
      data: url,
    })
  },

  openProduct() {
    const target = buildJdMiniProgramTarget(this.data.product)
    if (!target) {
      this.copyLink()
      return
    }
    wx.navigateToMiniProgram({
      ...target,
      fail: () => {
        wx.showModal({
          title: '暂时无法打开京东小程序',
          content: '已为你复制商品链接，请打开京东 App 粘贴访问。',
          showCancel: false,
          success: () => this.copyLink(),
        })
      },
    })
  },

  savePlan() {
    addHistory(this.data.plan)
    wx.showToast({
      title: '已保存',
      icon: 'success',
    })
  },
})
