const { saveCurrentPlan } = require('./storage')

function getPlanRoute(plan) {
  if (plan && plan.selectedProduct) {
    return '/pages/plan-detail/plan-detail'
  }

  if (plan && (plan.selectedCategory || (Array.isArray(plan.products) && plan.products.length))) {
    return '/pages/product-result/product-result'
  }

  return '/pages/category-result/category-result'
}

function openPlan(plan) {
  if (!plan || !plan.profile) {
    wx.navigateTo({
      url: '/pages/profile/profile',
    })
    return
  }

  saveCurrentPlan(plan)
  wx.navigateTo({
    url: getPlanRoute(plan),
  })
}

module.exports = {
  getPlanRoute,
  openPlan,
}
