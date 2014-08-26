var fs = require('fs')
var crypto = require('crypto')
var async = require('async')
var test = require('tape')

var ncbi = require('../')

var testData = require('./data')
var guillardiaThetaSRAData = require('./guillardia-theta.sra')


test('Download list', function(t) {
  t.plan(2)

    ncbi.urls('assembly', 'Guillardia theta')
    .on('data', function(data) {
      var msg = 'should take a database name (assembly) and search term (Guillardia theta), and list datasets URLs'
      t.deepEqual(data, testData.assembly['guillardia-theta'].urls, msg)
    })

    var results = []
    ncbi.urls('sra', 'Guillardia theta')
    .on('data', function(data) { results.push(data) })
    .on('end', function(data) {
      var msg = 'should take a database name (sra) and search term (Guillardia theta), and list datasets URLs'
      t.deepEqual(results, testData.sra['guillardia-theta'].urls, msg)
    })
})


test('Download', function(t) {
  t.plan(2)

  async.eachSeries(
    [
      'should take a database name and search term, and download datasets',
      'repeat same download to cover already downloaded branch'
    ],
    testDownload
  )

  function testDownload(msg, cb) {
    var path
    ncbi.download('assembly', 'Guillardia theta')
    .on('data', function(data) { path = data.path })
    .on('end', function() {
      var file = fs.ReadStream(path)
      var shasum = crypto.createHash('sha1')
      file.on('data', function(d) { shasum.update(d) })
      file.on('end', function() {
        var sha1 = shasum.digest('hex');
        t.equal(sha1, 'a2dc7b3b0ae6f40d5205c4394c2fe8bc65d52bc2', msg)
        cb()
      })
    })
  }
})


test('Search', function(t) {
  t.plan(2)

  ncbi.search('assembly', 'Guillardia theta')
  .on('data', function (data) {
    var msg = 'should take a database name and search term, and return the data'
    t.deepEqual(data, testData.assembly['guillardia-theta'].search, msg)
  })

  var results = []
  ncbi.search('sra', 'Guillardia theta')
  .on('data', function(data) { results.push(data) })
  .on('end', function() {
    var msg = 'same as previous but searching sra instead of assembly'
    t.deepEqual(results, guillardiaThetaSRAData, msg)
  })
})


test('Link', function(t) {
  t.plan(2)

  var results = []
  ncbi.link('sra', 'bioproject', '35533')
  .on('data', function(data) { results.push(data) })
  .on('end', function() {
    var msg = 'should take names for source database, destination database and a NCBI UID, and return the link'
    t.deepEqual(results, testData.link['sra-bioproject']['35533'], msg)
  })

  ncbi.link('bioproject', 'assembly', '53577')
  .on('data', function(data) {
    var results = []
    var msg = 'same as previous, but doing bioproject->assembly instead of sra->assembly to try get same assembly UID as Search'
    t.deepEqual(data.destUID, testData.assembly['guillardia-theta'].search.uid, msg)
  })
})
