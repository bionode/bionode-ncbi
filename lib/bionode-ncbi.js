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
//     # bionode-ncbi [command] [arguments] --limit (-l) --throughput (-t)
//     $ bionode-ncbi search taxonomy solenopsis
//     $ bionode-ncbi search sra human --limit 500 # only return 500 items
//     $ bionode-ncbi search sra human --throughput 250 # fetch 250 items per API request
//     $ bionode-ncbi download assembly solenopsis invicta
//     $ bionode-ncbi urls sra solenopsis invicta
//     $ bionode-ncbi link assembly bioproject 244018
//     $ bionode-ncbi search gds solenopsis | dat import --json


var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var async = require('async')
var request = require('request')
var through = require('through2')
var JSONStream = require('JSONStream')
var xml2js = require('xml2js').parseString
var nugget = require('nugget')
var tool = require('tool-stream')
var debug = require('debug')('bionode-ncbi')
var concat = require('concat-stream')
var pumpify = require('pumpify')
var URL = require('url')
var cheerio = require('cheerio')

var ncbi = exports

var PROXY = typeof window !== 'undefined' ? 'http://cors.inb.io/' : ''

var APIROOT = PROXY + 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/'
var DEFAULTS = 'retmode=json&version=2.0'
var RETURNMAX = 50
var XMLPROPERTIES = {
  'sra': ['expxml', 'runs'],
  'biosample': ['sampledata'],
  'assembly': ['meta' ]
}
var LASTSTREAM = {
  'sra': function() {
    return pumpify.obj(
      tool.ensureIsArray('runs.Run'),
      tool.filterObjectsArray('total_bases', '', 'runs.Run')
    )
  }
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
// Arguments can be passed as an object instead:
//
//     ncbi.search({ db: 'sra', term: 'solenopsis' })
//     .on('data', console.log)
//
// Advanced options can be passed using the previous syntax:
//
//     var options = {
//       db: 'assembly', // database to search
//       term: 'human',  // optional term for search
//       limit: 500,     // optional limit of NCBI results
//       throughput: 100 // optional number of items per request
//     }
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

ncbi.search = function(db, term, cb) {
  var opts = typeof db === 'string' ? { db: db, term: term } : db
  var cb = typeof term === 'function' ? term : cb

  var xmlProperties = XMLPROPERTIES[opts.db] || through.obj()
  var lastStream = LASTSTREAM[opts.db] || through.obj

  var stream = pumpify.obj(
    createAPISearchUrl(opts.db, opts.term),
    requestStream(),
    createAPIDataURL(opts),
    requestStream(),
    filterEmptyResults(),
    tool.extractProperty('result'),
    tool.deleteProperty('uids'),
    tool.arraySplit(),
    tool.XMLToJSProperties(xmlProperties),
    lastStream()
  )

  if (opts.term) { stream.write(opts.term); stream.end() }
  if (cb) { stream.pipe(concat(cb)) }
  else { return stream }
}


function createAPISearchUrl(db, term) {
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    var query = [
      APIROOT + 'esearch.fcgi?',
      DEFAULTS,
      'db=' + db,
      'term=' + encodeURI(obj.toString().replace(/['"]+/g, '')),
      'usehistory=y'
    ].join('&')
    debug('esearch request', query)
    this.push(query)
    next()
  }
}

function createAPIDataURL(opts) {
  var counter = 0
  var throughput = opts.throughput || RETURNMAX
  if (opts.limit < throughput) { throughput = opts.limit }
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    var count = opts.limit || obj.esearchresult.count
    var numRequests = Math.ceil(count / throughput)
    for (var i = 0; i < numRequests; i++) {
      var retstart = i * throughput
      var query = [
        APIROOT + 'esummary.fcgi?',
        DEFAULTS,
        'db=' + obj.db,
        'query_key=1',
        'WebEnv=' + obj.esearchresult.webenv,
        'retmax=' + throughput,
        'retstart=' + retstart
      ].join('&')
      debug('esummary request', query)
      this.push(query)
    }
    next()
    counter++
  }
}

function filterEmptyResults() {
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    if (obj.esummaryresult && obj.esummaryresult[0] === 'Empty result - nothing todo') {
      return next()
    }
    if (obj.error && obj.error[0] === 'Empty result - nothing todo') {
      return next()
    }
    if (obj.result) {
      this.push(obj)
    }
    next()
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

ncbi.link = function(srcDB, destDB, srcUID, cb) {
  var stream = pumpify.obj(
    createAPILinkURL(srcDB, destDB),
    requestStream(true),
    createLinkObj()
  )

  if (srcUID) { stream.write(srcUID); stream.end() }
  if (cb) { stream.pipe(concat(cb)) }
  else { return stream }
}

function createAPILinkURL(srcDB, destDB) {
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    var query = [
      APIROOT + 'elink.fcgi?',
      'dbfrom=' + srcDB,
      'db=' + destDB,
      'id=' + obj.toString()
    ].join('&')
    this.push(query)
    next()
  }
}

function createLinkObj() {
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    var self = this
    var query = URL.parse(obj.url, true).query
    var result = {
      srcDB: query.dbfrom,
      destDB: query.db,
      srcUID: query.id
    }
    xml2js(obj.body, function(err, data) {
      if (err) { self.emit('error', err) }
      if (data.eLinkResult.LinkSet[0].LinkSetDb) {
        data.eLinkResult.LinkSet[0].LinkSetDb.forEach(getMatch)
        function getMatch(link) {
          if (link.LinkName[0] === query.dbfrom + '_' + query.db) {
            link.Link.forEach(pushLink)
            function pushLink(link){
              result.destUID = link.Id[0]
              self.push(result)
            }
          }
        }
      }
      next()
    })
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

ncbi.download = function(db, term, cb) {
  var stream = pumpify.obj(
    ncbi.urls(db),
    download(db)
  )
  if (term) { stream.write(term); stream.end() }
  if (cb) { stream.pipe(concat(cb)) }
  else { return stream }
}

function download(db) {
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    var self = this
    var prevTime = Date.now()
    var currTime
    var chunkSizeMB = 1
    var chunkSize = chunkSizeMB * 1024 * 1024 //bytes
    var folder = obj.uid + '/'

    var fileName
    var extractFiles = {
      'sra': function() { return obj.url },
      'gff': function() { return obj.genomic.gff },
      'gbff': function() { return obj.genomic.gbff },
      'gpff': function() { return obj.protein.gpff },
      'assembly': function() { return obj.genomic.fna },
      'fasta': function() { return obj.genomic.fna },
      'fna': function() { return obj.genomic.fna },
      'faa': function() { return obj.protein.faa },
      'repeats': function() { return obj.rm.out },
      'md5': function() { return obj.md5checksums.txt }
    }
    var url = extractFiles[db]()

    var path = folder + url.replace(/.*\//, '')

    var log = {
      uid: obj.uid,
      url: url,
      path: path
    }

    mkdirp(obj.uid, {mode: 0755}, gotDir)
    function gotDir(err) {
      if (err) { self.emit('error', err) }
      debug('downloading', url)
      var dld = nugget(PROXY + url, {dir: folder, resume: true}, function(err) {
        if (err) return self.destroy(err)
        fs.stat(path, gotStat)
        function gotStat(err, stat) {
          if (err) return self.destroy(err)
          log.status = 'completed'
          log.speed = 'NA'
          log.size = Math.round(stat.size / 1024 / 1024) + ' MB'
          self.push(log)
          next()
        }
      })
      dld.on('progress', logging)
    }

    function logging(data) {
      currTime = Date.now()
      var diffTimeSec = (currTime - prevTime) / 1000
      prevTime = currTime
      log.status = 'downloading'
      log.total = data.transferred
      log.progress = data.percentage
      log.speed = data.speed
      self.push(log)
    }
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

ncbi.urls = function(db, term, cb) {
  var opts = typeof db === 'string' ? { db: db } : db
  var cb = typeof term === 'function' ? term : cb
  var extractFiles = ['gff', 'gpff', 'fasta', 'fna', 'faa', 'repeats']
  if (extractFiles.indexOf(db) !== -1) { opts.db = 'assembly' }

  var stream = pumpify.obj(
    ncbi.search(opts),
    createFTPURL(opts.db)
  )
  if (term) { stream.write(term); stream.end() }
  if (cb) { stream.pipe(concat(cb)) }
  else { return stream }
}

function createFTPURL(db) {
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    var self = this
    var parseURL = {
      sra: sraURL,
      assembly: assemblyURL,
      protein: proteinURL
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

    function proteinURL(){
      'http://www.ncbi.nlm.nih.gov/protein/XP_009457936.1?report=fasta&log$=seqview&format=text'
      var runs = obj.runs.Run
      async.eachSeries(runs, printProteinURL, next)
      function printProteinURL(run, cb) {
        var acc = run.acc
        var runURL = [
          'http://www.ncbi.nlm.nih.gov/protein/',
          obj.accessionversion,
          '?report=fasta&log$=seqview&format=text'
        ].join('')
        self.push({url: runURL, uid: obj.uid})
        cb()
      }
    }
    
    function assemblyURL() {
      if (obj.meta.FtpSites) {
        var ftpPath = obj.meta.FtpSites.FtpPath
        var ftpArray = Array.isArray(ftpPath) ? ftpPath : [ ftpPath ]
        var httpRoot = ftpArray[0]._.replace('ftp://', 'http://') // NCBI seems to return GenBank and RefSeq accessions for the same thing. We only need one.
        request({ uri: PROXY + httpRoot, withCredentials: false }, gotFTPDir)
        function gotFTPDir(err, res, body) {
          if (err) { self.emit('error', err) }
          if (!res || res.statusCode !== 200) { self.emit('err', res) }
          if (!body) { return next() }
          $ = cheerio.load(body)

          var urls = { uid: obj.uid }

          $('a').map(attachToResult)
          function attachToResult(i, a) {
            var href = a.attribs.href
            var base = path.basename(href)
            var fileNameProperties = base.replace(/.*\//, '').split('_')
            var fileNameExtensions = fileNameProperties[fileNameProperties.length-1].split('.')
            var fileType = fileNameExtensions[0]
            var fileFormat = fileNameExtensions[1] || 'dir'
            if (!urls[fileType]) { urls[fileType] = {} }
            urls[fileType][fileFormat] = httpRoot + '/' + href
          }
          self.push(urls)
          next()
        }
      }
      else {
        next()
      }
    }
  }
}


function requestStream(returnURL) {
  var stream = through.obj(transform)
  return stream

  function transform(obj, enc, next) {
    var self = this
    get()
    self.tries = 1
    function get() {
      if (self.tries > 20) { console.warn('tries' + self.tries + obj) }
      request({ uri: obj, json: true, timeout: 5000, withCredentials: false }, gotData)
      function gotData(err, res, body) {
        if (err || !res) { self.tries++; return get() }
        debug('request response', res.statusCode)
        debug('request results', body)
        if (body.esearchresult && body.esearchresult.ERROR) {
          self.emit('error', new Error(body.esearchresult.ERROR))
        }
        var result = returnURL ? {url: obj, body: body} : body
        self.push(result)
        next()
      }
    }
  }
}
