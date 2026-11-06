const { chooseContextImages } = require('../../utils/image-upload')
const { generateGiftPlanSeed } = require('../../utils/gift-profile')
const { getDraft, saveCurrentPlan, saveDraft } = require('../../utils/storage')
const { isInterruptedRequestError } = require('../../utils/api')

Page({
  data: {
    extraText: '',
    images: [],
    loading: false,
    error: '',
    resumeAfterShow: false,
  },

  onLoad() {
    const draft = getDraft()
    this.setData({
      extraText: draft.extraText || '',
      images: draft.images || [],
    })
  },

  onHide() {
    if (this.data.loading) {
      this.setData({ resumeAfterShow: true })
    }
  },

  onShow() {
    if (!this.data.resumeAfterShow || this.data.loading) return
    this.setData({ resumeAfterShow: false })
    this.generate()
  },

  inputExtra(event) {
    this.setData({
      extraText: event.detail.value,
    })
  },

  async addImage() {
    try {
      const images = await chooseContextImages(this.data.images)
      this.setData({ images })
    } catch (error) {
      wx.showToast({
        title: error.errMsg || '图片选择失败',
        icon: 'none',
      })
    }
  },

  removeImage(event) {
    const index = event.currentTarget.dataset.index
    const images = this.data.images.slice()
    images.splice(index, 1)
    this.setData({ images })
  },

  async generate() {
    if (this.data.loading) {
      return
    }
    const draft = {
      ...getDraft(),
      extraText: this.data.extraText,
      images: this.data.images,
    }
    saveDraft(draft)
    this.setData({ loading: true, error: '' })
    try {
      const seed = await generateGiftPlanSeed(draft)
      saveCurrentPlan({
        id: `plan-${Date.now()}`,
        draft,
        profile: seed.profile,
        categories: seed.categories,
        imageNotes: seed.imageNotes,
      })
      wx.navigateTo({
        url: '/pages/category-result/category-result',
      })
    } catch (error) {
      this.setData({
        error: isInterruptedRequestError(error)
          ? '连接在切屏时被系统中断，已自动重试；请保持小程序在前台后再试一次。'
          : (error.message || String(error)),
      })
    } finally {
      this.setData({ loading: false })
    }
  },
})
