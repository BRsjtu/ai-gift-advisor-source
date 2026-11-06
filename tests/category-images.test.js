const test = require('node:test')
const assert = require('node:assert/strict')
const { runCategoryImages, getImageState, getIllustratedCategories, retryCategoryImage } = require('../utils/category-images')
const { buildDraftPrompt } = require('../utils/gift-profile')
const { normalizeProfile } = require('../utils/gift-recommend')
const { getProfilePoints } = require('../utils/profile-points')

function environment() {
  const storage = new Map()
  const files = new Set()
  global.wx = {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    getFileSystemManager: () => ({ accessSync: (p) => { if (!files.has(p)) throw new Error('expired') } }),
  }
  return { files, storage }
}

test('new profiles render short bullets; legacy prose is retained as sentence points', () => {
  const profile = normalizeProfile({ summary: '喜欢美甲的朋友', style: '简洁', stylePoints: ['小巧精致', '日常实用'], boundaries: '不选私人物品。注意体面', risks: ['避开香味'] })
  assert.deepEqual(getProfilePoints(profile).stylePoints, ['小巧精致', '日常实用'])
  assert.deepEqual(getProfilePoints(profile).boundaryPoints, ['不选私人物品', '注意体面'])
  const prompt = buildDraftPrompt({ budget: '50-100元' }, [])
  assert.match(prompt, /budgetFit.*22 字/)
  assert.match(prompt, /stylePoints、boundaryPoints、risks/)
})

test('category images resume submitted jobs, preserve selection, and reload expired local images', async () => {
  const { files, storage } = environment()
  const plan = { id: 'plan-a', profile: {}, categories: [{ id: 'cat-0', name: '修甲套装', budgetFit: '可选指甲剪与收纳盒' }] }
  storage.set('gift.currentPlan', { ...plan, selectedCategory: { name: 'already selected' } })
  let visible = true
  let submissions = 0
  const dependencies = {
    request: async ({ method }) => {
      if (method !== 'GET') { submissions++; visible = false; return { data: { jobId: 'job-1' } } }
      return { data: { status: 'complete', data: { imageUrl: 'https://example.test/generated.png' } } }
    },
    localize: async () => { files.add('local-image'); return 'local-image' },
    sleep: async () => {},
  }
  const hooks = { isActive: () => visible, onUpdate() {} }
  await runCategoryImages(plan, hooks, dependencies)
  assert.equal(getImageState(plan, plan.categories[0]).jobId, 'job-1')
  visible = true
  await runCategoryImages(plan, hooks, dependencies)
  assert.equal(submissions, 1)
  assert.equal(getIllustratedCategories(plan)[0].illustration.path, 'local-image')
  files.clear()
  await runCategoryImages(plan, hooks, dependencies)
  assert.equal(submissions, 1)
  assert.equal(storage.get('gift.currentPlan').selectedCategory.name, 'already selected')
  await runCategoryImages(JSON.parse(JSON.stringify(plan)), hooks, dependencies)
  assert.equal(submissions, 1)
})

test('failed images expose the real error and require explicit retry', async () => {
  environment()
  const plan = { id: 'plan-b', categories: [{ id: 'cat-0', name: '香氛' }] }
  let submissions = 0
  const dependencies = {
    request: async ({ method }) => method === 'GET'
      ? { data: { status: 'failed', error: 'upstream 503' } }
      : (submissions++, { data: { jobId: 'job-x' } }),
    sleep: async () => {},
  }
  const hooks = { isActive: () => true, onUpdate() {} }
  await runCategoryImages(plan, hooks, dependencies)
  assert.equal(getImageState(plan, plan.categories[0]).error, 'upstream 503')
  await runCategoryImages(plan, hooks, dependencies)
  assert.equal(submissions, 1)
  retryCategoryImage(plan, plan.categories[0])
  await runCategoryImages(plan, hooks, dependencies)
  assert.equal(submissions, 2)
})
