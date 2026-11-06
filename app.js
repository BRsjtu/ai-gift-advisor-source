const DEFAULT_AI_BASE_URL = 'http://127.0.0.1:3010/ai'
const LEGACY_NEW_DOMAIN_AI_BASE_URL = 'https://yimaweilai.top/ai'
const LEGACY_HTTP_IP_AI_BASE_URL = 'http://127.0.0.1:3010/ai'
const LEGACY_HTTPS_IP_AI_BASE_URL = 'http://127.0.0.1:3010/ai'
const DOMAIN_AI_BASE_URL = 'https://api.ruibread.top/ai'

function normalizeAiBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^/]+\/ai$/.test(normalized)) {
    return ''
  }
  return normalized
}

App({
  globalData: {
    appName: 'AI 礼物',
    aiBaseUrl: DEFAULT_AI_BASE_URL,
    aiModel: 'gpt-5.6-luna',
    webSearchModel: 'gpt-5.6-luna',
    maxHistory: 20,
  },

  onLaunch() {
    const storedBaseUrl = wx.getStorageSync('gift.aiBaseUrl')
    const normalized = normalizeAiBaseUrl(storedBaseUrl)
    if (!storedBaseUrl || !normalized || normalized === LEGACY_NEW_DOMAIN_AI_BASE_URL || normalized === LEGACY_HTTP_IP_AI_BASE_URL || normalized === LEGACY_HTTPS_IP_AI_BASE_URL || normalized === DOMAIN_AI_BASE_URL) {
      this.globalData.aiBaseUrl = DEFAULT_AI_BASE_URL
      wx.setStorageSync('gift.aiBaseUrl', DEFAULT_AI_BASE_URL)
    } else {
      this.globalData.aiBaseUrl = normalized
    }
  },

  onShow() {
    this.globalData.appVisible = true
  },

  onHide() {
    this.globalData.appVisible = false
  },
})
