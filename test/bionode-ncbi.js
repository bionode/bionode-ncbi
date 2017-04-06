var fs = require('fs')
var crypto = require('crypto')
var test = require('tape')
var nock = require('nock')

var ncbi = require('../')

var testData = require('./data')
var guillardiaThetaSRAData = require('./guillardia-theta.sra')
var efetchTestData = require('./p53-nucest')

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
      var hash = testData['sra-sha1']
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
      var hash = testData['sra-sha1']
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

test('Fetch', function (t) {
  var results = []
  var stream = ncbi.fetch('nucest', 'p53')
  stream.on('data', function (data) { results.push(data) })
  stream.on('end', function () {
    var msg = 'Should retrieve the FASTA sequence from the nucest database that match the search term \'p53\''
    t.deepEqual(results, efetchTestData, msg)
    setTimeout(t.end, 2000)
  })
})

test('Error Handling', function (t) {
  var base = 'http://eutils.ncbi.nlm.nih.gov'
  var path = '/entrez/eutils/esearch.fcgi?&retmode=json&version=2.0&db=assembly&term=Guillardia_theta&usehistory=y'
  var results = []
  var msg = 'Should detect invalid return object and throw an error stating so, showing request URL'

  nock(base)
    .get(path)
    .reply(200, {esearchresult: {webenv: 'Fake Results'}})

  var stream = ncbi.search('assembly', 'Guillardia_theta')
  stream.on('data', function (data) { results.push(data) })
  stream.on('error', function (err) {
    t.equal(err.message, testData.error.message, msg)
  })
  stream.on('end', function () {
    t.fail(msg)
  })
  setTimeout(t.end, 2000)
})
