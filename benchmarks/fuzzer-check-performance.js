const { FuzzedDataProvider } = require('@jazzer.js/core')
const fastContentTypeParse = require('../index.js')

function fuzz (data) {
  const provider = new FuzzedDataProvider(data)

  const fmtString = provider.consumeRemainingAsString()
  // Ignore errors; we're interested in performance slowdown
  fastContentTypeParse.safeParse(fmtString)
}

module.exports = { fuzz }
