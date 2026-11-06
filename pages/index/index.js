const { getCurrentPlan } = require('../../utils/storage')
const { openPlan } = require('../../utils/plan-navigation')

Page({
  data: {
    lastPlan: {},
  },

  onShow() {
    this.setData({
      lastPlan: getCurrentPlan(),
    })
  },

  start() {
    wx.navigateTo({
      url: '/pages/profile/profile',
    })
  },

  openHistory() {
    wx.switchTab({
      url: '/pages/history/history',
    })
  },

  openLast() {
    openPlan(this.data.lastPlan)
  },
})
