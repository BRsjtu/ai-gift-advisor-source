const { chatJson, uploadImageAnalysis } = require('./api')
const {
  getChatText,
  normalizeCategories,
  normalizeProfile,
  safeJsonFromText,
} = require('./gift-recommend')

function buildDraftPrompt(draft, imageNotes) {
  return [
    '你是一个谨慎的送礼决策助手。请基于用户填写的信息生成送礼画像和礼物类别建议。',
    '不要假装知道真实商品库存，不要凭空编造购买链接。',
    '文案必须短而具体。summary 保留一段 60 字以内的送礼画像。interests 是 2-5 个短语；stylePoints、boundaryPoints、risks 各 1-3 个圆点要点，每点不超过 16 字，不写长段落。style 和 boundaries 只写一句概括。',
    '推荐 4 个不同的礼物类别。每个类别 name 不超过 12 字，reason 不超过 38 字，risk 不超过 28 字。budgetFit 只写一行不超过 22 字的具体可选物品，例如“可选指甲剪、修甲锉和收纳盒”，不要重复预算数字，不要“此价格可选择”等铺垫，不要长解释。',
    '每个类别的 keywords 必须是可直接用于电商平台搜索的简短商品搜索词，2-4 个即可，每个搜索词独立可用，不要把多个词堆在一句里。',
    'matchKeywords 返回 3-6 个能在商品标题中出现的具体品类词，例如“水彩笔”、“画笔”、“手冲”。不要使用“高端”、“送礼”、“礼物”这类通用修饰词。',
    'keywords 根据预算选择合理的具体商品规格或套装，并至少包含一个去掉修饰词的核心品类词。不要依赖“平价/高端/送礼”等词充当价格筛选，不要给所有搜索词加相同修饰词。',
    'keywords 不要只复述兴趣词，要能搜到具体商品类型。',
    '输出严格 JSON，格式为：',
    '{"profile":{"summary":"","interests":[],"style":"","stylePoints":[],"boundaries":"","boundaryPoints":[],"risks":[]},"categories":[{"name":"","reason":"","budgetFit":"","risk":"","keywords":[],"matchKeywords":[]}]}',
    '',
    `年龄：${draft.age || '未填写'}`,
    `性别：${draft.gender || '未填写'}`,
    `关系：${draft.relation || '未填写'}`,
    `预算：${draft.budget || '未填写'}`,
    `场景：${draft.occasion || '未填写'}`,
    `亲密度：${draft.closeness || '未填写'}`,
    `禁忌：${draft.taboo || '未填写'}`,
    `兴趣/风格：${draft.interests || draft.style || '未填写'}`,
    `补充文字：${draft.extraText || '无'}`,
    `图片线索：${imageNotes.length ? imageNotes.join('；') : '无'}`,
  ].join('\n')
}

async function analyzeImages(images) {
  const selected = (images || []).slice(0, 2)
  const notes = []
  for (const item of selected) {
    try {
      const response = await uploadImageAnalysis({
        filePath: item.uploadPath || item.path,
        prompt: '请只提取与送礼有关的偏好线索，输出 JSON：{"notes":[""],"caution":""}。不要识别隐私身份，不要复述聊天原文。',
      })
      const parsed = safeJsonFromText(getChatText(response)) || safeJsonFromText(response.data)
      if (parsed && Array.isArray(parsed.notes)) {
        notes.push(parsed.notes.join('，'))
      }
    } catch (_error) {
      throw new Error('图片线索识别接口失败。')
    }
  }
  return notes
}

async function generateGiftPlanSeed(draft) {
  const imageNotes = await analyzeImages(draft.images)
  const response = await chatJson({
    messages: [
      {
        role: 'user',
        content: buildDraftPrompt(draft, imageNotes),
      },
    ],
  })
  const parsed = safeJsonFromText(getChatText(response)) || {}
  return {
    profile: normalizeProfile(parsed.profile),
    categories: normalizeCategories(parsed.categories),
    imageNotes,
    source: 'ai',
  }
}

module.exports = {
  buildDraftPrompt,
  generateGiftPlanSeed,
  searchGiftAdvice: async function searchGiftAdvice(draft, category) {
    try {
      const response = await chatJson({
        webSearch: true,
        responseMimeType: 'text/plain',
        messages: [
          {
            role: 'user',
            content: [
              '请联网搜索并总结当前送礼场景的公开建议，控制在 4 条以内。',
              '不要给虚构商品链接；如果提到商品，只说类别或购买平台方向。',
              `关系：${draft.relation || '未填写'}`,
              `预算：${draft.budget || '未填写'}`,
              `场景：${draft.occasion || '未填写'}`,
              `类别：${category && category.name ? category.name : '未选择'}`,
            ].join('\n'),
          },
        ],
      })
      const text = getChatText(response)
      if (!text) {
        throw new Error('联网搜索未返回内容。')
      }
      return text
    } catch (error) {
      throw new Error(`联网建议接口失败：${error.message}`)
    }
  },
}
