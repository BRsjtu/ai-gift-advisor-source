const { getDraft, saveDraft } = require('../../utils/storage')

Page({
  data: {
    relationOptions: ['朋友', '同事', '长辈', '老师', '客户', '伴侣'],
    occasionOptions: ['生日', '节日', '拜访', '感谢', '纪念日', '毕业', '乔迁'],
    genderOptions: ['女', '男', '不限定'],
    closenessOptions: ['普通', '熟悉', '很亲密', '正式关系'],
    ageOptions: Array.from({ length: 100 }, (_item, index) => `${index + 1} 岁`),
    budgetOptions: ['50 元以内', '50-100 元', '100-300 元', '300-500 元', '500 元以上'],
    interestOptions: ['可爱', '朋克', '酷飒', '运动', '文艺', '潮流', '复古', 'Y2K', '科技', '舞蹈', '音乐', '暗黑', '美术', '二次元', '节日限定风', '游戏', '美妆', '影视', '美食', '宠物', '时尚穿搭'],
    platformOptions: [
      { label: '京东', value: 'jd' },
      { label: '淘宝/天猫', value: 'taobao' },
      { label: '抖音电商', value: 'douyin' },
    ],
    form: {},
    ageIndex: 21,
    customAge: '',
    customBudget: '',
    customInterests: '',
    selectedInterests: {},
  },

  onLoad() {
    const draft = getDraft()
    const ageValue = String(draft.age || '22').replace(/\s*岁$/, '')
    const ageNumber = Math.max(1, Math.min(100, Math.round(Number(ageValue) || 22)))
    const selectedInterests = {}
    String(draft.interests || '').split(/[、,，\s]+/).filter(Boolean).forEach((item) => {
      selectedInterests[item] = true
    })
    this.setData({
      form: {
        relation: '朋友',
        occasion: '生日',
        gender: '不限定',
        closeness: '熟悉',
        platformPreference: 'jd',
        ...draft,
        age: draft.age || `${ageNumber} 岁`,
      },
      ageIndex: ageNumber - 1,
      customAge: Number(ageValue) === ageNumber ? '' : ageValue,
      customBudget: this.data.budgetOptions.includes(draft.budget) ? '' : (draft.budget || ''),
      customInterests: String(draft.interests || '').split(/[、,，\s]+/).filter((item) => !this.data.interestOptions.includes(item)).join('、'),
      selectedInterests,
    })
  },

  chooseChip(event) {
    const { field, value } = event.currentTarget.dataset
    const nextData = { [`form.${field}`]: value }
    if (field === 'budget') nextData.customBudget = ''
    this.setData(nextData)
  },

  inputField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({
      [`form.${field}`]: event.detail.value,
    })
  },

  chooseAge(event) {
    const ageIndex = Number(event.detail.value)
    this.setData({ ageIndex, customAge: '', 'form.age': this.data.ageOptions[ageIndex] })
  },

  inputAge(event) {
    const value = String(event.detail.value || '').trim()
    this.setData({ customAge: value, 'form.age': value ? `${value} 岁` : this.data.ageOptions[this.data.ageIndex] })
  },

  inputBudget(event) {
    const value = event.detail.value
    this.setData({ customBudget: value, 'form.budget': value })
  },

  toggleInterest(event) {
    const value = event.currentTarget.dataset.value
    const selectedInterests = { ...this.data.selectedInterests, [value]: !this.data.selectedInterests[value] }
    const selected = this.data.interestOptions.filter((item) => selectedInterests[item])
    const custom = String(this.data.customInterests || '').trim()
    this.setData({ selectedInterests, 'form.interests': selected.concat(custom ? [custom] : []).join('、') })
  },

  inputInterests(event) {
    const customInterests = event.detail.value
    const selected = this.data.interestOptions.filter((item) => this.data.selectedInterests[item])
    this.setData({ customInterests, 'form.interests': selected.concat(customInterests ? [customInterests] : []).join('、') })
  },

  next() {
    const form = this.data.form
    if (!form.relation || !form.occasion || !form.budget) {
      wx.showToast({
        title: '请填写关系、场景和预算',
        icon: 'none',
      })
      return
    }
    saveDraft(form)
    wx.navigateTo({
      url: '/pages/upload-context/upload-context',
    })
  },
})
