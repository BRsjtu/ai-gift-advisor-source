const { clearHistory, getHistory } = require('../../utils/storage')
const { openPlan } = require('../../utils/plan-navigation')

Page({
  data: {
    history: [],
  },

  onShow() {
    this.setData({
      history: getHistory(),
    })
  },

  start() {
    wx.navigateTo({
      url: '/pages/profile/profile',
    })
  },

  openPlan(event) {
    const plan = this.data.history[event.currentTarget.dataset.index]
    openPlan(plan)
  },

  clear() {
    wx.showModal({
      title: '清空历史',
      content: '确认删除本机保存的历史方案？',
      success: (res) => {
        if (res.confirm) {
          clearHistory()
          this.setData({ history: [] })
        }
      },
    })
  },
})
