const DRAFT_KEY = 'gift.currentDraft'
const PLAN_KEY = 'gift.currentPlan'
const HISTORY_KEY = 'gift.history'

function getNowText() {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function readJson(key, fallback) {
  try {
    const value = wx.getStorageSync(key)
    return value || fallback
  } catch (_error) {
    return fallback
  }
}

function saveDraft(draft) {
  wx.setStorageSync(DRAFT_KEY, {
    ...(draft || {}),
    updatedAt: getNowText(),
  })
}

function getDraft() {
  return readJson(DRAFT_KEY, {})
}

function saveCurrentPlan(plan) {
  wx.setStorageSync(PLAN_KEY, {
    ...(plan || {}),
    updatedAt: getNowText(),
  })
}

function getCurrentPlan() {
  return readJson(PLAN_KEY, {})
}

function getHistory() {
  return readJson(HISTORY_KEY, [])
}

function addHistory(plan) {
  const app = getApp()
  const limit = app && app.globalData ? app.globalData.maxHistory || 20 : 20
  const item = {
    ...(plan || {}),
    id: plan.id || `plan-${Date.now()}`,
    savedAt: getNowText(),
  }
  const history = [item].concat(getHistory().filter((old) => old.id !== item.id)).slice(0, limit)
  wx.setStorageSync(HISTORY_KEY, history)
  return item
}

function clearHistory() {
  wx.removeStorageSync(HISTORY_KEY)
}

module.exports = {
  saveDraft,
  getDraft,
  saveCurrentPlan,
  getCurrentPlan,
  addHistory,
  getHistory,
  clearHistory,
  getNowText,
}

