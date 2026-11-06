const { chatJson, generateImage } = require('./api')
const { getChatText, safeJsonFromText } = require('./gift-recommend')

function saveGeneratedImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const targetPath = `${wx.env.USER_DATA_PATH}/gift-guide-${Date.now()}.png`
    wx.downloadFile({
      url: imageUrl,
      success: (download) => {
        if (download.statusCode >= 200 && download.statusCode < 300 && download.tempFilePath) {
          resolve(download.tempFilePath)
          return
        }
        reject(new Error(`图片下载失败：status=${download.statusCode || 0}`))
      },
      fail: reject,
    })
  }).catch(() => new Promise((resolve, reject) => {
    wx.request({
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 120000,
      success: (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300 || !response.data) {
          reject(new Error(`图片读取失败：status=${response.statusCode || 0}`))
          return
        }
        const targetPath = `${wx.env.USER_DATA_PATH}/gift-guide-${Date.now()}.png`
        try {
          wx.getFileSystemManager().writeFileSync(targetPath, response.data)
          resolve(targetPath)
        } catch (error) {
          reject(error)
        }
      },
      fail: reject,
    })
  }))
}

function saveGeneratedBase64(imageBase64) {
  return new Promise((resolve, reject) => {
    try {
      const targetPath = `${wx.env.USER_DATA_PATH}/gift-guide-${Date.now()}.png`
      wx.getFileSystemManager().writeFile({
        filePath: targetPath,
        data: imageBase64,
        encoding: 'base64',
        success: () => resolve(targetPath),
        fail: reject,
      })
    } catch (error) {
      reject(error)
    }
  })
}

function getCardCustomization(guide, customization = {}) {
  const recipientName = String(customization.recipientName || '').trim()
  const recipientAge = String(customization.recipientAge || '').trim()
  const blessing = String(customization.blessing || guide.motto || '').trim()
  return {
    title: String(guide.title || '送礼攻略').trim(),
    recipient: `${recipientName ? `给${recipientName}` : '给特别的你'}${recipientAge ? ` · ${recipientAge}岁` : ''}`,
    blessing,
  }
}

function buildCardImagePrompt(guide, customization = {}) {
  const card = getCardCustomization(guide, customization)
  return [
    guide.imagePrompt,
    '请直接生成一张完整的竖版送礼祝福卡片成品，不要只生成背景图。',
    '画面下方安排清晰、留白充足的卡片文字区，把下面指定的简体中文直接排版进图片中。文字必须完整、清晰、无错别字，不要添加其他可读文字、英文、品牌、水印或乱码。',
    `固定文字一：送礼物不纠结`,
    `固定文字二：${card.title}`,
    `固定文字三：${card.recipient}`,
    `固定文字四：${card.blessing}`,
    '整体风格精致、温暖、简洁，文字与画面有明确层次，适合手机分享和保存到相册。',
    '竖版构图，比例约 2:3。',
  ].join('\n')
}

async function generateCardImage(guide, customization) {
  const imageResponse = await generateImage({
    prompt: buildCardImagePrompt(guide, customization),
  })
  const imageData = imageResponse && imageResponse.data ? imageResponse.data : {}
  if (!imageData.imageUrl && !imageData.imageBase64) {
    throw new Error('礼物卡片画作接口未返回图片。')
  }
  if (imageData.imageUrl) {
    try {
      return await saveGeneratedImage(imageData.imageUrl)
    } catch (error) {
      throw new Error(`礼物卡片图片下载失败：${error.message || String(error)}`)
    }
  }
  try {
    return await saveGeneratedBase64(imageData.imageBase64)
  } catch (error) {
    throw new Error(`礼物卡片图片写入失败：${error.message || String(error)}`)
  }
}

function buildGuidePrompt(plan) {
  const draft = plan.draft || {}
  const profile = plan.profile || {}
  const category = plan.selectedCategory || {}
  return [
    '你是送礼策划师。请根据送礼画像和礼物类别，生成一份简短、温暖、具体的送礼攻略。',
    '输出严格 JSON，不要 Markdown：',
    '{"title":"","motto":"","blessings":["","",""],"guide":"","imagePrompt":""}',
    'title 是 12 字以内的攻略标题；motto 是 45 字以内的送礼心语；blessings 是 3 条适合直接写在卡片上的祝福语，每条 28 字以内；guide 是 120 字以内的送礼建议；imagePrompt 是给生图模型的中文画面描述。所有可读文案必须使用自然、简洁的简体中文，不要夹带英文单词或英文句子（AI、TA、DIY 等界面已有术语除外）。',
    'imagePrompt 只描述礼物卡片画面，不出现真实品牌、人物肖像、可读文字或水印；画面要适合竖版手机礼物卡片。',
    `关系：${draft.relation || '未填写'}`,
    `场景：${draft.occasion || '未填写'}`,
    `预算：${draft.budget || '未填写'}`,
    `亲密度：${draft.closeness || '未填写'}`,
    `禁忌：${draft.taboo || '未填写'}`,
    `兴趣线索：${draft.interests || draft.style || draft.extraText || '未填写'}`,
    `送礼画像：${JSON.stringify(profile)}`,
    `礼物类别：${category.name || '未选择'}`,
  ].join('\n')
}

async function generateGiftGuide(plan) {
  const response = await chatJson({
    messages: [{ role: 'user', content: buildGuidePrompt(plan) }],
    temperature: 0.5,
  })
  const guide = safeJsonFromText(getChatText(response))
  if (!guide || !guide.motto || !guide.imagePrompt) {
    throw new Error('AI 未返回完整的送礼攻略。')
  }

  const imageUrl = await generateCardImage(guide, {})
  return {
    title: guide.title || '送礼攻略',
    motto: guide.motto,
    blessings: Array.isArray(guide.blessings)
      ? guide.blessings.filter(Boolean).slice(0, 5)
      : [guide.motto].filter(Boolean),
    guide: guide.guide || '',
    imagePrompt: guide.imagePrompt,
    imageUrl,
  }
}

module.exports = {
  saveGeneratedImage,
  saveGeneratedBase64,
  buildGuidePrompt,
  buildCardImagePrompt,
  generateCardImage,
  generateGiftGuide,
}
