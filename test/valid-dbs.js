var tape = require('tape')
var tapeNock = require('tape-nock')
var validDbs = require('../lib/valid-dbs')
var ncbi = require('../lib/bionode-ncbi')

var test = tapeNock(tape)

test('valid-dbs printDbs', t => {
  var dummy = {fakedb: 'Fake!', another: 'Another'}

  var expected = 'fakedb (Fake!)\nanother (Another)'

  t.equals(validDbs.printDbs(dummy), expected, 'printDbs returns the expected string')

  t.end()
})

// TODO move this test to a suite just for bionode-ncbi search
test('bionode-ncbi search', t => {
  t.plan(1)

  try {
    ncbi.search('invalid', 'human')
  } catch (err) {
    t.assert(err instanceof validDbs.InvalidDbError, 'call search with wrong db throws InvalidDbError')
  }
})
