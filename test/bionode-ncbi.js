var fs = require('fs')
var crypto = require('crypto')
var test = require('tape')

var ncbi = require('../')

var testData = require('./data')
var guillardiaThetaSRAData = require('./guillardia-theta.sra')

test('Download list', function (t) {
  var msg = 'should take a database name (assembly) and search term (Guillardia theta), and list datasets URLs'
  var db = 'assembly'
  var expResult = [testData.assembly['guillardia-theta'].urls]
  var results = []
  var stream = ncbi.urls(db, 'Guillardia theta')
  stream.on('data', function (data) { results.push(data) })
  stream.on('end', function () {
    t.deepEqual(results, expResult, msg)
    setTimeout(t.end, 2000)
  })
})

test('Download list', function (t) {
  var msg = 'should take a database name (sra) and search term (Guillardia theta), and list datasets URLs'
  var db = 'sra'
  var expResult = testData.sra['guillardia-theta'].urls
  var results = []
  var stream = ncbi.urls(db, 'Guillardia theta')
  stream.on('data', function (data) { results.push(data) })
  stream.on('end', function () {
    t.deepEqual(results, expResult, msg)
    setTimeout(t.end, 2000)
  })
})

test('Download', function (t) {
  var msg = 'should take a database name and search term, and download'
  var path = ''
  var stream = ncbi.download('assembly', 'Guillardia theta')
  stream.on('data', function (data) { path = data.path })
  stream.on('end', function () {
    var file = fs.createReadStream(path)
    var shasum = crypto.createHash('sha1')
    file.on('data', function (d) { shasum.update(d) })
    file.on('end', function () {
      var sha1 = shasum.digest('hex')
      var hash = 'a2dc7b3b0ae6f40d5205c4394c2fe8bc65d52bc2'
      t.equal(sha1, hash, msg)
      setTimeout(t.end, 2000)
    })
  })
})

test('Download', function (t) {
  var msg = 'repeat same download to cover already downloaded branch'
  var path = ''
  var stream = ncbi.download('assembly', 'Guillardia theta')
  stream.on('data', function (data) { path = data.path })
  stream.on('end', function () {
    var file = fs.createReadStream(path)
    var shasum = crypto.createHash('sha1')
    file.on('data', function (d) { shasum.update(d) })
    file.on('end', function () {
      var sha1 = shasum.digest('hex')
      var hash = 'a2dc7b3b0ae6f40d5205c4394c2fe8bc65d52bc2'
      t.equal(sha1, hash, msg)
      setTimeout(t.end, 2000)
    })
  })
})

test('Search', function (t) {
  var results1 = []
  var stream = ncbi.search('assembly', 'Guillardia theta')
  stream.on('data', function (data) { results1.push(data) })
  stream.on('end', function (data) {
    var msg = 'should take a database name and search term, and return the data'
    t.deepEqual(results1[0], testData.assembly['guillardia-theta'].search, msg)
    setTimeout(t.end, 2000)
  })
})

test('Search', function (t) {
  var results2 = []
  var stream = ncbi.search('sra', 'Guillardia theta')
  stream.on('data', function (data) { results2.push(data) })
  stream.on('end', function () {
    var msg = 'same as previous but searching sra instead of assembly'
    t.deepEqual(results2, guillardiaThetaSRAData, msg)
    setTimeout(t.end, 2000)
  })
})

test('Search', function (t) {
  var results3 = []
  var stream = ncbi.search({ db: 'sra', term: 'Guillardia theta', limit: 1 })
  stream.on('data', function (data) {
    results3.push(data)
  })
  stream.on('end', function () {
    var msg = 'same as previous but with a limit of 1'
    guillardiaThetaSRAData.forEach(findMatchAndTest)
    function findMatchAndTest (sradata) {
      if (sradata.uid === results3[0].uid) {
        t.deepEqual(results3, [sradata], msg)
        setTimeout(t.end, 2000)
      }
    }
  })
})

test('Link', function (t) {
  var results = []
  var stream = ncbi.link('sra', 'bioproject', '35533')
  stream.on('data', function (data) { results.push(data) })
  stream.on('end', function () {
    var msg = 'should take names for source database, destination database and a NCBI UID, and return the link'
    t.deepEqual(results, testData.link['sra-bioproject']['35533'], msg)
    setTimeout(t.end, 2000)
  })
})

test('Link', function (t) {
  var results = []
  var stream = ncbi.link('bioproject', 'assembly', '53577')
  stream.on('data', function (data) { results.push(data) })
  stream.on('end', function () {
    var msg = 'same as previous, but doing bioproject->assembly instead of sra->assembly to try get same assembly UID as Search'
    t.deepEqual(results[0].destUIDs[0], testData.assembly['guillardia-theta'].search.uid, msg)
    setTimeout(t.end, 2000)
  })
})
