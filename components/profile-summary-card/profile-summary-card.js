const { getProfilePoints } = require('../../utils/profile-points')

Component({
  properties: {
    profile: {
      type: Object,
      value: {},
    },
  },

  observers: {
    profile(value) {
      this.setData(getProfilePoints(value || {}))
    },
  },

  data: {
    interestPoints: [],
    stylePoints: [],
    boundaryPoints: [],
    riskPoints: [],
  },
})
