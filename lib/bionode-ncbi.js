// # bionode-ncbi
// > Node.js module for working with the NCBI API (aka e-utils) using Streams.
// >
// > doi: [10.5281/zenodo.10610](http://dx.doi.org/10.5281/zenodo.10610)
// > author: [Bruno Vieira](http://bmpvieira.com)
// > email: <mail@bmpvieira.com>
// > license: [MIT](https://raw.githubusercontent.com/bionode/bionode-ncbi/master/LICENSE)
//
// ---
//
// ## Usage
// This module can be used in Node.js as described further below, or as a command line tool.
// Examples:
//
//     $ npm install -g bionode-ncbi
//
//     # bionode-ncbi [command] [arguments]
//     $ bionode-ncbi search taxonomy solenopsis
//     $ bionode-ncbi download assembly solenopsis invicta
//     $ bionode-ncbi urls sra solenopsis invicta
//     $ bionode-ncbi link assembly bioproject 244018
//     $ bionode-ncbi search gds solenopsis | dat import --json


var fs = require('fs')
var mkdirp = require('mkdirp')
var async = require('async')
var request = require('request')
var through = require('through2')
var JSONStream = require('JSONStream')
var xml2js = require('xml2js').parseString
var dld = require('dld')
var tool = require('tool-stream')
var debug = require('debug')('bionode-ncbi')


module.exports = exports = ncbi = new NCBI()

function NCBI() {
  this.APIROOT = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/'
  this.DEFAULTS = 'retmode=json&version=2.0'
  this.RETURNMAX = 250
  this.XMLPROPERTIES = {
    'sra': ['expxml', 'runs'],
    'biosample': ['sampledata'],
    'assembly': ['meta' ]
  }
  return this
}


// ## Search
// Takes a NCBI database string and a optional search term and returns a stream of objects found:
//
//     ncbi.search('sra', 'solenopsis').on('data', console.log)
//     => { uid: '280116',
//          expxml: {"Summary":{"Title":"Single Solenopsis invicta male","Platform":{"_":"ILLUMINA", [...],
//          runs: {"Run":[{"acc":"SRR620577","total_spots":"23699662","total_bases":"4787331724", [...],
//          extlinks: '    ',
//          createdate: '2013/02/07',
//          updatedate: '2012/11/28' }
//     => { uid: '280243',
//          expxml: {"Summary":{"Title":"Illumina small-insert paired end","Platform":{"_":"ILLUMINA", [...],
//          runs: {"Run":[{"acc":"SRR621118","total_spots":"343209818","total_bases":"34320981800", [...],
//          extlinks: '    ',
//          createdate: '2013/02/07,
//          updatedate: '2012/11/28' }
//     => [...]
//
// The search term can also be passed with write:
//
//     var search = ncbi.search('sra').on('data', console.log)
//     search.write('solenopsis')
//
// Or piped, for example, from a file:
//
//     var split = require('split')
//
//     fs.createReadStream('searchTerms.txt')
//     .pipe(split())
//     .pipe(search)

NCBI.prototype.search = function(db, term) {
  var stream = through.obj(transform)
  if (term) { stream.write(term); stream.end() }
  return stream

  function transform(obj, enc, next) {
    var self = this
    var query = [
      ncbi.APIROOT + 'esearch.fcgi?',
      ncbi.DEFAULTS,
      'db=' + db,
      'term=' + encodeURI(obj),
      'usehistory=y'
    ].join('&')

    var getUIDs = _requestData(db)

    debug('esearch request', query)

    var req = request({ uri: query, json: true })

    req.on('response', function(resp) {
      debug('esearch response', resp.statusCode)
    })

    req
    .pipe(JSONStream.parse())
    .pipe(_requestsSplit(db))
    .pipe(getUIDs)

    _attachStandardEvents(getUIDs, self, next)
  }
}

function _requestsSplit(db) {
  return through.obj(transform)
  function transform(obj, enc, next) {
    debug('esearch results', obj)
    var self = this
    var webenv = obj.esearchresult.webenv
    var count = obj.esearchresult.count
    var numRequests = Math.floor(count / ncbi.RETURNMAX)
    for (var i = 0; i <= numRequests; i++) {
      var start = { db: db, webenv: webenv, retstart: i * ncbi.RETURNMAX }
      self.push(start)
    }
    next()
  }
}

function _requestData(db) {
  return through.obj(transform)
  function transform(obj, enc, next) {
    var self = this

    var query = [
      ncbi.APIROOT + 'esummary.fcgi?',
      ncbi.DEFAULTS,
      'db=' + obj.db,
      'query_key=1',
      'WebEnv=' + obj.webenv,
      'retmax=' + ncbi.RETURNMAX,
      'retstart=' + obj.retstart
    ].join('&')
    var xmlProperties = ncbi.XMLPROPERTIES[db] || []

    var finish = through.obj()
    if (db === 'sra') {
      var sraFinish = tool.filterObjectsArray('total_bases', '', 'runs.Run')
      _attachStandardEvents(sraFinish, self, next)
      finish
      .pipe(tool.ensureIsArray('runs.Run'))
      .pipe(sraFinish)
    }
    else {
      _attachStandardEvents(finish, self, next)
    }

    debug('esummary request', query)

    var req = request({uri: query, json: true})

    req.on('response', function(resp) {
      debug('esummary response', resp.statusCode)
    })

    req
    .pipe(JSONStream.parse())
    .pipe(tool.extractProperty('result'))
    .pipe(tool.deleteProperty('uids'))
    .pipe(tool.arraySplit())
    .pipe(tool.XMLToJSProperties(xmlProperties))
    .pipe(finish)
  }
}


// ## Link
// Takes a string for source NCBI database and another for destination db and returns
// a objects stream with unique IDs linked to the passed source db unique ID.
//
//     ncbi.link('taxonomy', 'sra', 443821)
//     => { "srcDB":"taxonomy",
//          "destDB":"sra",
//          "srcUID":"443821",
//          "destUID":"677548" }
//     => { "srcDB":"taxonomy",
//          "destDB":"sra",
//          "srcUID":"443821",
//          "destUID":"677547" }
//     => [...]
//
// Also works with write and pipe, like **Search**.

NCBI.prototype.link = function(srcDB, destDB, srcUID) {
  var stream = through.obj(getDestUID)
  if (srcUID) { stream.write(srcUID); stream.end() }
  return stream

  function getDestUID(srcUID, enc, next) {
    var self = this

    var query = [
      ncbi.APIROOT + 'elink.fcgi?',
      'dbfrom=' + srcDB,
      'db=' + destDB,
      'id=' + srcUID
    ].join('&')

    var link = {
      srcDB: srcDB,
      destDB: destDB,
      srcUID: srcUID
    }

    var linkName = srcDB+'_'+destDB

    var getLink = tool.attachToObject(link, 'destUID')

    debug('elink request', query)

    request({ uri: query, json: true })
    .pipe(_wait(500))
    .pipe(tool.XMLToJS(true))
    .pipe(tool.extractProperty('LinkSet.0.LinkSetDb'))
    .pipe(tool.arraySplit())
    .pipe(tool.collectMatch('LinkName.0', linkName))
    .pipe(tool.extractProperty('Link'))
    .pipe(tool.arraySplit())
    .pipe(tool.extractProperty('Id.0'))
    .pipe(getLink)
    _attachStandardEvents(getLink, self, next)
  }
}

// ## Download
// Takes a NCBI database string and a optional search term and downloads the datasets/sequence files.
// ** Currently only supports sra and assembly databases. **
// Also accepts the keyword gff for annotations.
// Returns a stream that emits download progress and ends with download path
// The name of the folder where the file is saved corresponds to the UID from NCBI.
//
//     ncbi.download('assembly', 'solenopsis invicta')
//     .on('data', console.log)
//     .on('end', function(path) {
//       console.log('File saved at ' + path)
//     }
//     => Downloading 244018/unplaced.scaf.fa.gz 0.94 % of 106 MB at 0.48 MB/s
//     => Downloading 244018/unplaced.scaf.fa.gz 100.00 % of 106 MB at 0.49 MB/s"
//     => File saved at 244018/unplaced.scaf.fa.gz

NCBI.prototype.download = function(db, term) {
  var stream = through.obj(transform)
  if (term) { stream.write(term); stream.end() }
  return stream
  function transform(obj, enc, next) {
    var self = this
    var download = _download()
    var searchdb = db === 'gff' ? 'genome' : db
    var getdb = db

    ncbi.search(searchdb, obj)
    .pipe(_getURLs(getdb))
    .pipe(download)
    _attachStandardEvents(download, self, next)
  }
}


// ## URLs
// Takes a NCBI database string and a optional search term and returns as stream of dataset/sequence files URLs.
// ** Currently only supports sra and assembly databases. **
// Also accepts the keyword gff for annotations.
// The value of the uid property corresponds to the UID from NCBI.
//
//     ncbi.urls('assembly', 'solenopsis invicta')
//     .on('data', console.log)
//     => {"url":"http://ftp.ncbi.nlm.nih.gov/genbank/genomes/Eukaryotes/invertebrates/Solenopsis_invicta/Si_gnG/Primary_Assembly/unplaced_scaffolds/FASTA/unplaced.scaf.fa.gz",
//         "uid":"244018/"}

NCBI.prototype.urls = function(db, term) {
  var stream = through.obj(transform)
  if (term) { stream.write(term); stream.end() }
  return stream
  function transform(obj, enc, next) {
    var self = this
    var searchdb = db === 'gff' ? 'genome' : db
    var getdb = db
    var getURLs = _getURLs(getdb)
    ncbi.search(searchdb, obj)
    .pipe(getURLs)
    _attachStandardEvents(getURLs, self, next)
  }
}

function _getURLs(db) {
  return through.obj(transform)
  function transform(obj, enc, next) {
    var self = this
    var parseURL = {
      sra: sraURL,
      assembly: assemblyURL,
      gff: gffURL
    }

    parseURL[db]()

    function sraURL() {
      var runs = obj.runs.Run
      async.eachSeries(runs, printSRAURL, next)
      function printSRAURL(run, cb) {
        var acc = run.acc
        var runURL = [
          'http://ftp.ncbi.nlm.nih.gov/sra/sra-instant/reads/ByRun/sra/',
          acc.slice(0,3) + '/',
          acc.slice(0,6) + '/',
          acc + '/',
          acc + '.sra',
        ].join('')
        self.push({url: runURL, uid: obj.uid})
        cb()
      }
    }

    function assemblyURL() {
      if (obj.meta.FtpSites) {
        var ftpPath = obj.meta.FtpSites.FtpPath
        var ftpArray = Array.isArray(ftpPath) ? ftpPath : [ ftpPath ]
        ftpArray.forEach(function(ftp) {
          var assemblyURL = ftp._.replace('ftp://', 'http://') + '/Primary_Assembly/unplaced_scaffolds/FASTA/unplaced.scaf.fa.gz'
          self.push({url: assemblyURL, uid: obj.uid})
        })
      }
      next()
    }

    function gffURL() {
      ncbi.search('assembly', obj.assembly_name).on('data', createURL)
      function createURL(obj) {
        debug('gffURL result', obj)
        var gffURL
        var ftpPath = obj.meta.FtpSites.FtpPath
        var ftpArray = Array.isArray(ftpPath) ? ftpPath : [ ftpPath ]
        ftpArray.forEach(function(ftp) {
          if (ftp.type === 'RefSeq') {
            gffURL = ftp._.replace('ftp://', 'http://') + 'GFF/ref_' + obj.assemblyname + '_top_level.gff3.gz'
          }
        })
        if (gffURL) { self.push({url: gffURL, uid: obj.uid}) }
      }
    }
  }
}

function _download(db, term) {
  return through.obj(transform)
  function transform(obj, enc, next) {
    var self = this
    var prevTime = Date.now()
    var currTime
    var chunkSizeMB = 1
    var chunkSize = chunkSizeMB * 1024 * 1024 //bytes
    var folder = obj.uid + '/'
    var path = folder + obj.url.replace(/.*\//, '')

    mkdirp.sync(obj.uid)
    if (!fs.existsSync(path)) {
      debug('downloading', obj.url)
      dld(obj.url, folder, chunkSize)
      .on('data', log)
      .on('end', function() {
        self.push(path)
        next()
      })
      .on('error', function(err) { self.emit('error', err) })
    }
    else {
      self.push(path)
      next()
    }

    function log(position, size) {
      var progress = (position * 100 / size).toFixed(2) + ' %'
      var sizeMB = Math.round(size / 1024 / 1024) + ' MB'
      currTime = Date.now()
      var diffTimeSec = (currTime - prevTime) / 1000
      prevTime = currTime
      var speed =  (chunkSizeMB / diffTimeSec).toFixed(2) + ' MB/s'
      var log = 'Downloading ' + path+' '+ progress + ' of ' + sizeMB + ' at ' + speed
      self.push(log)
    }
  }
}


function _attachStandardEvents(stream, self, next) {
  stream
  .on('data', function(data) { self.push(data) })
  .on('end', function() { next() })
  .on('error', function(err) { self.emit('error', err) })
}

function _wait(ms) {
  return through.obj(transform)
  function transform(obj, enc, next) {
    var self = this
    setTimeout(pushObj, ms)
    function pushObj() {
      self.push(obj)
      next()
    }
  }
}
