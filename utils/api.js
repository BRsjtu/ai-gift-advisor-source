function getAppConfig() {
  const app = getApp()
  return app && app.globalData ? app.globalData : {}
}

function normalizeBaseUrl(baseUrl) {
  const fallback = 'http://127.0.0.1:3010/ai'
  const normalized = String(baseUrl || getAppConfig().aiBaseUrl || fallback).trim().replace(/\/+$/, '')
  if (normalized === 'https://yimaweilai.top/ai' || normalized === 'http://127.0.0.1:3010/ai' || normalized === 'http://127.0.0.1:3010/ai' || normalized === 'https://api.ruibread.top/ai') {
    return fallback
  }
  if (!/^https?:\/\/[^/]+\/ai$/.test(normalized)) {
    return fallback
  }
  return normalized
}

function getRequestErrorText(error) {
  if (!error) return ''
  return typeof error === 'string' ? error : (error.errMsg || error.message || String(error))
}

function isInterruptedRequestError(error) {
  return /(?:request|uploadFile):fail\s+(interrupted|abort|aborted)/i.test(getRequestErrorText(error))
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForAppVisible() {
  const app = getApp()
  if (!app || !app.globalData || app.globalData.appVisible !== false) return
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await wait(1000)
    if (app.globalData.appVisible !== false) return
  }
}

function requestJson({ path, data, method = 'POST', timeout = 180000, baseUrl }) {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`
  const maxInterruptedRetries = 3

  const requestOnce = () => new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      timeout,
      header: {
        'Content-Type': 'application/json',
      },
      data,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {})
          return
        }
        reject(new Error(`请求失败：${url} status=${res.statusCode} ${JSON.stringify(res.data || {})}`))
      },
      fail(err) {
        reject(new Error(`网络请求失败：${url} ${JSON.stringify(err)}`))
      },
    })
  })

  return (async () => {
    let interruptedRetries = 0
    while (true) {
      try {
        return await requestOnce()
      } catch (error) {
        if (!isInterruptedRequestError(error) || interruptedRetries >= maxInterruptedRetries) {
          throw error
        }
        interruptedRetries += 1
        await waitForAppVisible()
        await wait(1000 * interruptedRetries)
      }
    }
  })()
}

function chatJson({ messages, responseMimeType = 'application/json', temperature = 0.2, webSearch = false }) {
  const config = getAppConfig()
  return requestJson({
    path: '/v1/chat',
    data: {
      model: webSearch ? (config.webSearchModel || config.aiModel) : config.aiModel,
      messages,
      responseMimeType,
      temperature,
      webSearch,
    },
  })
}

function uploadImageAnalysis({ filePath, prompt }) {
  const config = getAppConfig()
  const url = `${normalizeBaseUrl(config.aiBaseUrl)}/v1/chat/upload`
  const formData = {
    model: config.aiModel,
    messages: JSON.stringify([
      {
        role: 'user',
        content: prompt,
      },
    ]),
    responseMimeType: 'application/json',
    temperature: '0.1',
    mimeType: 'image/jpeg',
  }
  const uploadOnce = () => new Promise((resolve, reject) => {
    wx.uploadFile({
      url,
      filePath,
      name: 'image',
      timeout: 120000,
      formData,
      success(res) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`图片分析失败：status=${res.statusCode}`))
          return
        }
        try {
          resolve(JSON.parse(res.data || '{}'))
        } catch (error) {
          reject(error)
        }
      },
      fail(err) {
        reject(new Error(`图片上传失败：${url} ${JSON.stringify(err)}`))
      },
    })
  })

  return (async () => {
    let interruptedRetries = 0
    while (true) {
      try {
        return await uploadOnce()
      } catch (error) {
        if (!isInterruptedRequestError(error) || interruptedRetries >= 3) {
          throw error
        }
        interruptedRetries += 1
        await waitForAppVisible()
        await wait(1000 * interruptedRetries)
      }
    }
  })()
}

async function generateImage({ prompt, model = 'gpt-image-2', size = '1024x1536', quality = 'medium' }) {
  const queued = await requestJson({
    path: '/v1/images/generate',
    data: { model, prompt, size, quality },
    timeout: 30000,
  })
  const jobId = queued && queued.data && queued.data.jobId
  if (!jobId) {
    throw new Error('生图接口未返回任务编号。')
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await wait(2000)
    const status = await requestJson({
      path: `/v1/images/generate/status?jobId=${encodeURIComponent(jobId)}`,
      method: 'GET',
      timeout: 30000,
    })
    const job = status && status.data ? status.data : {}
    if (job.status === 'complete') {
      return { data: job.data || {} }
    }
    if (job.status === 'failed') {
      throw new Error(job.error || '礼物卡片生图失败。')
    }
  }
  throw new Error('礼物卡片生图等待超时，请稍后重试。')
}

module.exports = {
  normalizeBaseUrl,
  getRequestErrorText,
  isInterruptedRequestError,
  requestJson,
  chatJson,
  uploadImageAnalysis,
  generateImage,
}
