// Anonymous usage metrics for debug and funding, if user agrees
const Insight = require('insight')
const pkg = require('../package.json')

const insight = new Insight({
  // Google Analytics tracking code
  trackingCode: 'UA-54802258-3',
  pkg
})
if (insight.optOut === undefined) {
  insight.askPermission('Bionode is open and free. Can we anonymously report usage statistics for improvement and funding purposes?')
}

module.exports = insight
