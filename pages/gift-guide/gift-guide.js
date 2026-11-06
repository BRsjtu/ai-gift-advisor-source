const { getCurrentPlan, saveCurrentPlan } = require('../../utils/storage')
const { generateGiftGuide, generateCardImage } = require('../../utils/gift-guide')

Page({
  data: {
    plan: {},
    guide: {},
    loading: false,
    saving: false,
    error: '',
    recipientName: '',
    recipientAge: '',
    selectedBlessing: '',
    customBlessing: '',
    composedCardPath: '',
  },

  onLoad() {
    const plan = getCurrentPlan()
    if (!plan || !plan.selectedCategory) {
      wx.redirectTo({ url: '/pages/category-result/category-result' })
      return
    }
    const guide = plan.guide || {}
    const blessings = this.normalizeBlessings(guide)
    this.setData({
      plan,
      guide: { ...guide, blessings },
      selectedBlessing: guide.selectedBlessing || blessings[0] || '',
      recipientName: guide.recipientName || '',
      recipientAge: guide.recipientAge || '',
      customBlessing: guide.customBlessing || '',
    })
    if (!plan.guide || !plan.guide.motto || !Array.isArray(plan.guide.blessings) || !plan.guide.blessings.length) {
      this.createGuide()
    }
  },

  normalizeBlessings(guide) {
    const values = Array.isArray(guide.blessings) ? guide.blessings.filter(Boolean) : []
    return values.length ? values.slice(0, 5) : [guide.motto || '愿每一份心意，都被温柔接住。']
  },

  async createGuide() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const guide = await generateGiftGuide(this.data.plan)
      const blessings = this.normalizeBlessings(guide)
      const nextGuide = { ...guide, blessings, selectedBlessing: blessings[0] || '' }
      const plan = { ...this.data.plan, guide: nextGuide }
      saveCurrentPlan(plan)
      this.setData({ plan, guide: nextGuide, selectedBlessing: nextGuide.selectedBlessing })
    } catch (error) {
      this.setData({ error: error.message || String(error) })
    } finally {
      this.setData({ loading: false })
    }
  },

  onNameInput(event) {
    this.setData({ recipientName: event.detail.value, composedCardPath: '' })
  },

  onAgeInput(event) {
    this.setData({ recipientAge: event.detail.value, composedCardPath: '' })
  },

  onBlessingInput(event) {
    this.setData({ customBlessing: event.detail.value, selectedBlessing: '', composedCardPath: '' })
  },

  selectBlessing(event) {
    const blessing = event.currentTarget.dataset.blessing || ''
    this.setData({ selectedBlessing: blessing, customBlessing: '', composedCardPath: '' })
  },

  getCardText() {
    return String(this.data.customBlessing || this.data.selectedBlessing || this.data.guide.motto || '').trim()
  },

  async saveCardState() {
    const guide = {
      ...this.data.guide,
      recipientName: this.data.recipientName,
      recipientAge: this.data.recipientAge,
      selectedBlessing: this.data.selectedBlessing,
      customBlessing: this.data.customBlessing,
    }
    const plan = { ...this.data.plan, guide }
    saveCurrentPlan(plan)
    this.setData({ plan, guide })
    return plan
  },

  async composeCard() {
    if (this.data.saving || !this.data.guide.imagePrompt) return ''
    this.setData({ saving: true, error: '' })
    try {
      await this.saveCardState()
      const result = await generateCardImage(this.data.guide, {
        recipientName: this.data.recipientName,
        recipientAge: this.data.recipientAge,
        blessing: this.getCardText(),
      })
      const guide = { ...this.data.guide, imageUrl: result }
      const plan = { ...this.data.plan, guide }
      saveCurrentPlan(plan)
      this.setData({ plan, guide, composedCardPath: result })
      wx.showToast({ title: '卡片已生成', icon: 'success' })
      return result
    } catch (error) {
      this.setData({ error: `卡片合成失败：${error.message || String(error)}` })
      return ''
    } finally {
      this.setData({ saving: false })
    }
  },


  previewCard() {
    if (this.data.composedCardPath) {
      wx.previewImage({ urls: [this.data.composedCardPath] })
      return
    }
    this.composeCard()
  },

  async saveToAlbum() {
    if (!this.data.composedCardPath) {
      const composedCardPath = await this.composeCard()
      if (composedCardPath) {
        this.saveImageFile(composedCardPath)
      }
      return
    }
    this.saveImageFile(this.data.composedCardPath)
  },

  saveImageFile(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (error) => this.setData({ error: `保存失败：${error.errMsg || String(error)}` }),
    })
  },

  openProducts() {
    wx.navigateTo({ url: '/pages/product-result/product-result' })
  },
})
