Component({
  properties: {
    expanded: { type: Boolean, value: false },
    product: {
      type: Object,
      value: {},
    },
  },

  methods: {
    onTap() {
      this.triggerEvent('open', this.properties.product)
    },
  },
})
