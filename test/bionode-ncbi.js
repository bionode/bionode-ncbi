var fs = require('fs')
var crypto = require('crypto')
var test = require('tape')

var ncbi = require('../')

var testData = require('./data')
var guillardiaThetaSRAData = require('./guillardia-theta.sra')

test('Download list', function (t) {
  t.plan(1)
  var msg = 'should take a database name (assembly) and search term (Guillardia theta), and list datasets URLs'
  var db = 'assembly'

  var expResult = [testData.assembly['guillardia-theta'].urls]
  var results = []
  ncbi.urls(db, 'Guillardia theta')
  .on('data', function (data) { results.push(data) })
  .on('end', function () {
    t.deepEqual(results, expResult, msg)
  })
})

test('Download list', function (t) {
  t.plan(1)
  var db = 'sra'
  var expResult = testData.sra['guillardia-theta'].urls
  var msg = 'should take a database name (sra) and search term (Guillardia theta), and list datasets URLs'

  var results = []
  ncbi.urls(db, 'Guillardia theta')
  .on('data', function (data) { results.push(data) })
  .on('end', function () {
    t.deepEqual(results, expResult, msg)
  })
})

test('Download', function (t) {
  t.plan(1)
  var msg = 'should take a database name and search term, and download'
  var path
  var results = []
  var stream = ncbi.download('assembly', 'Guillardia theta')
  stream
  .on('data', function (data) {
    results.push(data)
    path = data.path
  })
  .on('end', function () {
    var file = fs.createReadStream(path)
    var shasum = crypto.createHash('sha1')
    file.on('data', function (d) { shasum.update(d) })
    file.on('end', function () {
      var sha1 = shasum.digest('hex')
      var hash = 'a2dc7b3b0ae6f40d5205c4394c2fe8bc65d52bc2'
      t.equal(sha1, hash, msg)
    })
  })
})

test('Download', function (t) {
  t.plan(1)
  var msg = 'repeat same download to cover already downloaded branch'
  var path
  var results = []
  var stream = ncbi.download('assembly', 'Guillardia theta')
  stream
  .on('data', function (data) {
    results.push(data)
    path = data.path
  })
  .on('end', function () {
    var file = fs.createReadStream(path)
    var shasum = crypto.createHash('sha1')
    file.on('data', function (d) { shasum.update(d) })
    file.on('end', function () {
      var sha1 = shasum.digest('hex')
      var hash = 'a2dc7b3b0ae6f40d5205c4394c2fe8bc65d52bc2'
      t.equal(sha1, hash, msg)
    })
  })
})

test('Search', function (t) {
  t.plan(1)
  var results1 = []
  ncbi.search('assembly', 'Guillardia theta')
  .on('data', function (data) { results1.push(data) })
  .on('end', function (data) {
    var msg = 'should take a database name and search term, and return the data'
    t.deepEqual(results1[0], testData.assembly['guillardia-theta'].search, msg)
  })
})

test('Search', function (t) {
  t.plan(1)
  var results2 = []
  ncbi.search('sra', 'Guillardia theta')
  .on('data', function (data) { results2.push(data) })
  .on('end', function () {
    var msg = 'same as previous but searching sra instead of assembly'
    t.deepEqual(results2, guillardiaThetaSRAData, msg)
  })
})

test('Search', function (t) {
  t.plan(1)
  var results3 = []
  ncbi.search({ db: 'sra', term: 'Guillardia theta', limit: 1 })
  .on('data', function (data) { results3.push(data) })
  .on('end', function () {
    var msg = 'same as previous but with a limit of 1'
    guillardiaThetaSRAData.forEach(findMatchAndTest)
    function findMatchAndTest (sradata) {
      if (sradata.uid === results3[0].uid) {
        t.deepEqual(results3, [sradata], msg)
      }
    }
  })
})

test('Link', function (t) {
  t.plan(1)
  var results = []
  ncbi.link('sra', 'bioproject', '35533')
  .on('data', function (data) { results.push(data) })
  .on('end', function () {
    var msg = 'should take names for source database, destination database and a NCBI UID, and return the link'
    t.deepEqual(results, testData.link['sra-bioproject']['35533'], msg)
  })
})

test('Link', function (t) {
  t.plan(1)
  var results = []
  ncbi.link('bioproject', 'assembly', '53577')
  .on('data', function (data) { results.push(data) })
  .on('end', function () {
    var msg = 'same as previous, but doing bioproject->assembly instead of sra->assembly to try get same assembly UID as Search'
    t.deepEqual(results[0].destUIDs[0], testData.assembly['guillardia-theta'].search.uid, msg)
  })
})
