const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

function loadProfile(draft = {}) {
  let page
  let saved
  let destination
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/profile/profile.js'), 'utf8'), {
    Page(value) { page = value },
    require() { return { getDraft: () => draft, saveDraft: value => { saved = value } } },
    wx: { showToast() {}, navigateTo({ url }) { destination = url } },
  })
  page.setData = function (updates) {
    for (const [key, value] of Object.entries(updates)) {
      const parts = key.split('.')
      let target = this.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)] = value
    }
  }
  page.onLoad()
  return { page, saved: () => saved, destination: () => destination }
}

test('age picker clears manual input; saved manual ages survive reopening', () => {
  const { page } = loadProfile({ age: '105 岁' })
  assert.equal(page.data.form.age, '105 岁')
  assert.equal(page.data.customAge, '105')
  page.inputAge({ detail: { value: '37' } })
  page.chooseAge({ detail: { value: '28' } })
  assert.equal(page.data.form.age, '29 岁')
  assert.equal(page.data.customAge, '')
})

test('preset and DIY interests and budget persist into the next step', () => {
  const harness = loadProfile()
  const page = harness.page
  assert.equal(page.data.interestOptions.length, 21)
  page.inputBudget({ detail: { value: '200-400 元' } })
  page.toggleInterest({ currentTarget: { dataset: { value: '文艺' } } })
  page.inputInterests({ detail: { value: '手冲咖啡' } })
  page.next()
  assert.equal(harness.saved().budget, '200-400 元')
  assert.equal(harness.saved().interests, '文艺、手冲咖啡')
  assert.equal(harness.destination(), '/pages/upload-context/upload-context')
  const restored = loadProfile(harness.saved()).page
  assert.equal(restored.data.selectedInterests['文艺'], true)
  assert.equal(restored.data.customInterests, '手冲咖啡')
  restored.chooseChip({ currentTarget: { dataset: { field: 'budget', value: '100-300 元' } } })
  assert.equal(restored.data.customBudget, '')
  assert.equal(restored.data.form.budget, '100-300 元')
})
