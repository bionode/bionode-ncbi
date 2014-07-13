var fs = require('fs')
var crypto = require('crypto')

var ncbi = require('../')
var testData = require('./data')
var guillardiaThetaSRAData = require('./guillardia-theta.sra')
var should = require('should')

require('mocha')


describe("Download list", function() {
  this.timeout(60000)
  it("should take a database name (assembly) and search term (Guillardia theta), and list datasets URLs", function(done) {
    ncbi.urls('assembly', 'Guillardia theta').on('data', function(data) {
      data.should.eql(testData.assembly['guillardia-theta']['download-list'][0])
      done()
    })
  })
  it("should take a database name (sra) and search term (Guillardia theta), and list datasets URLs", function(done) {
    var results = []
    ncbi.urls('sra', 'Guillardia theta')
    .on('data', function(data) {
      results.push(data)
    })
    .on('end', function(data) {
      results.should.eql(testData.sra['guillardia-theta']['download-list'])
      done()
    })
  })
})

describe("Download", function() {
  this.timeout(600000)
  it("should take a database name and search term, and download datasets", function(done) {
    download(done)
  })
  it("repeat same download to cover already downloaded branch", function(done) {
    download(done)
  })
  function download(cb) {
    var path
    ncbi.download('assembly', 'Guillardia theta')
    .on('data', function(data) { path = data })
    .on('end', function() {
      var file = fs.ReadStream(path)
      var shasum = crypto.createHash('sha1')
      file.on('data', function(d) { shasum.update(d) })
      file.on('end', function() {
        var sha1 = shasum.digest('hex');
        sha1.should.eql('273876e05dea78b2fbafee3713ad2d88e991f97c')
        cb()
      })
    })
  }
})

describe("Search", function() {
  this.timeout(60000)
  it("should take a database name and search term, and return the data", function(done) {
    ncbi.search('assembly', 'Guillardia theta')
    .on('data', function (data) {
      data.should.eql(testData.assembly['guillardia-theta'].search)
      done()
    })
  })
  it("same as previous but searching sra instead of assembly", function(done) {
    var results = []
    ncbi.search('sra', 'Guillardia theta')
    .on('data', function(data) {
      results.push(JSON.parse(JSON.stringify(data)))
    })
    .on('end', function() {
      results.should.eql(guillardiaThetaSRAData)
      done()
    })
  })
})

describe("Link", function() {
  this.timeout(60000)
  it("should take names for source database, destination database and a NCBI UID, and return the link", function(done) {
    var results = []
    ncbi.link('sra', 'bioproject', '35533')
    .on('data', function(data) {
      results.push(JSON.parse(JSON.stringify(data)))
    })
    .on('end', function() {
      results.should.eql(testData.link['sra-bioproject']['35533'])
      done()
    })
  })
  it("same as previous, but doing bioproject->assembly instead of sra->assembly to try get same assembly UID as Search", function(done) {
    var results = []
    ncbi.link('bioproject', 'assembly', '53577')
    .on('data', function(data) {
      data.destUID.should.eql(testData.assembly['guillardia-theta'].search.uid)
      done()
    })
  })
})
