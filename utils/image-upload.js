function chooseContextImages(existing) {
  const current = existing || []
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: Math.max(1, 4 - current.length),
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const images = (res.tempFiles || []).map((file) => ({
          path: file.tempFilePath,
          uploadPath: file.tempFilePath,
          size: file.size,
          type: 'image',
        }))
        resolve(current.concat(images).slice(0, 4))
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

module.exports = {
  chooseContextImages,
}

