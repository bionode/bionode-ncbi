var fs = require('fs')
var crypto = require('crypto')
var async = require('async')
var test = require('tape')

var ncbi = require('../')

var testData = require('./data')
var guillardiaThetaSRAData = require('./guillardia-theta.sra')

test('Download list', function (t) {
  t.plan(2)

  async.eachSeries([
    { db: 'assembly',
      expResult: [testData.assembly['guillardia-theta'].urls],
      msg: 'should take a database name (assembly) and search term (Guillardia theta), and list datasets URLs'},
    { db: 'sra',
      expResult: testData.sra['guillardia-theta'].urls,
      msg: 'should take a database name (sra) and search term (Guillardia theta), and list datasets URLs'}
  ], testSearch)

  function testSearch (obj, cb) {
    var results = []
    ncbi.urls(obj.db, 'Guillardia theta')
    .on('data', function (data) { results.push(data) })
    .on('end', function () {
      t.deepEqual(results, obj.expResult, obj.msg)
      cb()
    })
  }
})

test('Download', function (t) {
  t.plan(2)

  async.eachSeries(
    [
      'should take a database name and search term, and download datasets',
      'repeat same download to cover already downloaded branch'
    ],
    testDownload
  )

  function testDownload (msg, cb) {
    console.warn(msg)
    var path
    var results = []
    var stream = ncbi.download('assembly', 'Guillardia theta')
    stream
    .on('data', function (data) {
      console.warn('got data')
      console.warn(data)
      results.push(data)
      path = data.path
    })
    .on('end', function () {
      console.warn('Hello1')
      if (typeof path !== 'string') {
        console.warn('Hello2')
        console.warn(path)
        console.warn(results)
      }
      var file = fs.createReadStream(path)
      var shasum = crypto.createHash('sha1')
      file.on('data', function (d) { shasum.update(d) })
      file.on('end', function () {
        console.warn('finished reading file')
        var sha1 = shasum.digest('hex')
        var hash = 'a2dc7b3b0ae6f40d5205c4394c2fe8bc65d52bc2'
        t.equal(sha1, hash, msg)
        setTimeout(cb, 2000)
      })
    })
  }
})

test('Search', function (t) {
  t.plan(3)

  async.series([
    subtest1,
    subtest2,
    subtest3
  ])

  function subtest1 (cb) {
    var results1 = []
    ncbi.search('assembly', 'Guillardia theta')
    .on('data', function (data) { results1.push(data) })
    .on('end', function (data) {
      var msg = 'should take a database name and search term, and return the data'
      t.deepEqual(results1[0], testData.assembly['guillardia-theta'].search, msg)
      cb()
    })
  }

  function subtest2 (cb) {
    var results2 = []
    ncbi.search('sra', 'Guillardia theta')
    .on('data', function (data) { results2.push(data) })
    .on('end', function () {
      var msg = 'same as previous but searching sra instead of assembly'
      t.deepEqual(results2, guillardiaThetaSRAData, msg)
      cb()
    })
  }

  function subtest3 (cb) {
    var results3 = []
    ncbi.search({ db: 'sra', term: 'Guillardia theta', limit: 1 })
    .on('data', function (data) { results3.push(data) })
    .on('end', function () {
      var msg = 'same as previous but with a limit of 1'
      guillardiaThetaSRAData.forEach(findMatchAndTest)
      function findMatchAndTest (sradata) {
        if (sradata.uid === results3[0].uid) {
          t.deepEqual(results3, [sradata], msg)
          cb()
        }
      }
    })
  }

  // These tests fail randomly on Travis because of network speed
  // var start1 = Date.now()
  // ncbi.search({ db: 'sra', term: 'human', limit: 500, throughput: 500 })
  // .on('data', function(data) {})
  // .on('end', function() {
  //   var msg = 'get 500 objects fast from sra using throughput of 500 per request'
  //   var seconds = (Date.now() - start1) / 1000
  //   var fast = seconds < 10
  //   t.ok(fast, msg)
  // })
  //
  // var start2 = Date.now()
  // ncbi.search({ db: 'sra', term: 'human', limit: 500, throughput: 5 })
  // .on('data', function(data) {})
  // .on('end', function() {
  //   var msg = 'get 500 objects slowly from sra using throughput of 5 per request'
  //   var seconds = (Date.now() - start2) / 1000
  //   var slow = seconds > 10
  //   t.ok(slow, msg)
  // })
})

test('Link', function (t) {
  t.plan(2)

  async.series([
    subtest1,
    subtest2
  ])

  function subtest1 (cb) {
    var results = []
    ncbi.link('sra', 'bioproject', '35533')
    .on('data', function (data) { results.push(data) })
    .on('end', function () {
      var msg = 'should take names for source database, destination database and a NCBI UID, and return the link'
      t.deepEqual(results, testData.link['sra-bioproject']['35533'], msg)
      cb()
    })
  }

  function subtest2 (cb) {
    var results = []
    ncbi.link('bioproject', 'assembly', '53577')
    .on('data', function (data) { results.push(data) })
    .on('end', function () {
      var msg = 'same as previous, but doing bioproject->assembly instead of sra->assembly to try get same assembly UID as Search'
      t.deepEqual(results[0].destUIDs[0], testData.assembly['guillardia-theta'].search.uid, msg)
      cb()
    })
  }
})
