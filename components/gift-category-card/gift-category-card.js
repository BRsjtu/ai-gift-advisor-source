Component({
  properties: {
    category: {
      type: Object,
      value: {},
    },
  },

  methods: {
    onRetry() {
      this.triggerEvent('retry', this.properties.category)
    },
    onTap() {
      this.triggerEvent('select', this.properties.category)
    },
  },
})
