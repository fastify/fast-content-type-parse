const { FuzzedDataProvider } = require('@jazzer.js/core')
const fastContentTypeParse = require('../index.js')

function fuzz (data) {
  const provider = new FuzzedDataProvider(data)

  const fmtString = provider.consumeRemainingAsString()
  try {
    fastContentTypeParse.parse(fmtString)
  } catch (error) {
    // Ignore all expected errors
    if (!(error instanceof TypeError)) {
      throw error
    }
  }
}

module.exports = { fuzz }
