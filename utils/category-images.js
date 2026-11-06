const { requestJson } = require('./api')
const { saveGeneratedImage, saveGeneratedBase64 } = require('./gift-guide')

const CACHE_KEY = 'gift.categoryIllustrations.v1'

function categoryImageKey(plan, category) {
  return `${plan.id}:${category.id || category.name}:${category.name}`
}

function getImageState(plan, category) {
  return (wx.getStorageSync(CACHE_KEY) || {})[categoryImageKey(plan, category)] || {}
}

function setImageState(plan, category, patch) {
  const cache = wx.getStorageSync(CACHE_KEY) || {}
  const key = categoryImageKey(plan, category)
  cache[key] = { ...cache[key], ...patch, updatedAt: Date.now() }
  const recent = Object.entries(cache).sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 100)
  wx.setStorageSync(CACHE_KEY, Object.fromEntries(recent))
  return cache[key]
}

function localImageExists(path) {
  if (!path) return false
  try {
    wx.getFileSystemManager().accessSync(path)
    return true
  } catch (_error) {
    return false
  }
}

function getIllustratedCategories(plan) {
  return (plan.categories || []).map((category) => {
    const illustration = getImageState(plan, category)
    return { ...category, illustration: { ...illustration, path: localImageExists(illustration.path) ? illustration.path : '' } }
  })
}

function buildCategoryImagePrompt(category, profile = {}) {
  return [
    '生成一张礼物类别的方形编辑摄影示意图，单幅画面，不是拼图。',
    `主体：${category.name}。具体物品参考：${category.budgetFit || (category.keywords || []).join('、')}。`,
    `风格：${profile.style || '简洁、有质感'}。`,
    '完整展示 1-3 件有代表性的物品，居中，四周留白，物品不得裁出画面。',
    '白色或极浅冷灰背景，自然柔光，真实材质，少量海蓝色及淡金色包装点缀，清楚易辨认。',
    '不要人物、文字、字母、商标、价格、标签、水印或边框。它是品类灵感图，不是具体在售商品。',
  ].join('\n')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function runCategoryImages(plan, { isActive, onUpdate }, dependencies = {}) {
  const request = dependencies.request || requestJson
  const localize = dependencies.localize || saveGeneratedImage
  const saveBase64 = dependencies.saveBase64 || saveGeneratedBase64
  const pause = dependencies.sleep || sleep
  const queue = (plan.categories || []).slice()
  const update = (category, patch) => {
    setImageState(plan, category, patch)
    onUpdate()
  }

  async function draw(category) {
    let state = getImageState(plan, category)
    if (state.status === 'failed' || localImageExists(state.path)) return
    try {
      if (state.url) {
        update(category, { status: 'complete', path: await localize(state.url), error: '' })
        return
      }
      if (!state.jobId) {
        update(category, { status: 'queued', error: '' })
        const queued = await request({ path: '/v1/images/generate', timeout: 30000, data: {
          model: 'gpt-image-2', size: '1024x1024', quality: 'low',
          prompt: buildCategoryImagePrompt(category, plan.profile),
        } })
        if (!queued.data || !queued.data.jobId) throw new Error('类别配图接口未返回任务编号。')
        // Persist immediately so returning from another page resumes this job.
        state = setImageState(plan, category, { jobId: queued.data.jobId, status: 'running' })
        onUpdate()
      }
      for (let attempt = 0; attempt < 120 && isActive(); attempt += 1) {
        const response = await request({ path: `/v1/images/generate/status?jobId=${encodeURIComponent(state.jobId)}`, method: 'GET', timeout: 15000 })
        const job = response.data || {}
        if (job.status === 'failed') {
          update(category, { jobId: '', status: 'failed', error: job.error || '类别配图生成失败。' })
          return
        }
        if (job.status === 'complete') {
          const data = job.data || {}
          if (!data.imageUrl && !data.imageBase64) throw new Error('类别配图任务未返回图片。')
          update(category, { url: data.imageUrl || '' })
          const path = data.imageUrl ? await localize(data.imageUrl) : await saveBase64(data.imageBase64)
          update(category, { status: 'complete', path, error: '' })
          return
        }
        await pause(2000)
      }
      if (isActive()) throw new Error('类别配图等待超时，重试将继续查询原任务。')
    } catch (error) {
      const message = error.message || error.errMsg || String(error)
      update(category, {
        status: 'failed', error: message,
        ...(/status=404/.test(message) ? { jobId: '' } : {}),
      })
    }
  }

  async function worker() {
    while (queue.length && isActive()) await draw(queue.shift())
  }
  await Promise.all([worker(), worker()])
}

function retryCategoryImage(plan, category) {
  setImageState(plan, category, { status: 'queued', error: '', path: '' })
}

module.exports = { categoryImageKey, getImageState, getIllustratedCategories, buildCategoryImagePrompt, runCategoryImages, retryCategoryImage }
