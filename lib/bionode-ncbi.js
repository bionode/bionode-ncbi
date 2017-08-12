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
//     # bionode-ncbi [command] [arguments] --limit (-l) --throughput (-t) --pretty (-p)
//     $ bionode-ncbi search taxonomy solenopsis
//     $ bionode-ncbi search sra human --limit 500 # only return 500 items
//     $ bionode-ncbi search sra human --throughput 250 # fetch 250 items per API request
//     $ bionode-ncbi download assembly solenopsis invicta --pretty # returns a simple progress bar to stdout
//     $ bionode-ncbi urls sra solenopsis invicta
//     $ bionode-ncbi link assembly bioproject 244018
//     $ bionode-ncbi search gds solenopsis | dat import --json

var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var async = require('async')
var request = require('request')
var through = require('through2')
var xml2js = require('xml2js').parseString
var nugget = require('nugget')
var tool = require('tool-stream')
var debug = require('debug')('bionode-ncbi')
var concat = require('concat-stream')
var pumpify = require('pumpify')
var URL = require('url')
var cheerio = require('cheerio')
var fasta = require('bionode-fasta')
var insight = require('./anonymous-tracking')

var validDbs = require('./valid-dbs')
var InvalidDbError = validDbs.InvalidDbError

var ncbi = exports

var PROXY = typeof window !== 'undefined' ? 'http://cors.inb.io/' : ''

var APIROOT = PROXY + 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/'
var DEFAULTS = 'retmode=json&version=2.0'
var RETURNMAX = 50
var XMLPROPERTIES = {
  'sra': ['expxml', 'runs'],
  'biosample': ['sampledata'],
  'assembly': ['meta']
}
var LASTSTREAM = {
  'sra': function () {
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

ncbi.search = function (db, term, cb) {
  insight.track('ncbi', 'search')
  var opts = typeof db === 'string' ? { db, term } : db
  cb = typeof term === 'function' ? term : cb

  if (Object.keys(validDbs.dbs).indexOf(opts.db) < 0) {
    throw new InvalidDbError('The database "' + opts.db + '" is not a valid ncbi database')
  }

  var stream = pumpify.obj(
    createAPISearchUrl(opts.db, opts.term),
    requestStream(true),
    createAPIPaginateURL(opts),
    requestStream(true),
    createAPIDataUrl(),
    fetchByID(opts.db)
  )

  if (opts.term) { stream.write(opts.term); stream.end() }
  if (cb) { stream.pipe(concat(cb)) } else { return stream }
}

function createAPISearchUrl (db, term) {
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
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

function createAPIPaginateURL (opts) {
  var throughput = opts.throughput || RETURNMAX
  if (opts.limit < throughput) { throughput = opts.limit }
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var esearchRes = obj.body.esearchresult
    if (esearchRes === undefined ||
        esearchRes.webenv === undefined ||
        esearchRes.count === undefined) {
      var msg = 'NCBI returned invalid results, this could be a temporary' +
                ' issue with NCBI servers.\nRequest URL: ' + obj.url
      this.emit('error', new Error(msg))
      return next()
    }
    var count = opts.limit || esearchRes.count
    if (parseInt(esearchRes.count, 10) === 1) {
      this.push(obj.url)
      return next()
    }
    var urlQuery = URL.parse(obj.url, true).query
    var numRequests = Math.ceil(count / throughput)
    for (var i = 0; i < numRequests; i++) {
      var retstart = i * throughput
      var query = [
        APIROOT + 'esearch.fcgi?',
        DEFAULTS,
        'db=' + urlQuery.db,
        'term=' + urlQuery.term,
        'query_key=1',
        'WebEnv=' + esearchRes.webenv,
        'retmax=' + throughput,
        'retstart=' + retstart
      ].join('&')
      debug('paginate request', query)
      this.push(query)
    }
    next()
  }
}

function createAPIDataUrl () {
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var idsChunkLen = 50
    var idlist = obj.body.esearchresult.idlist
    if (!idlist || idlist.length === 0) { return next() }
    for (var i = 0; i < idlist.length; i += idsChunkLen) {
      var idsChunk = idlist.slice(i, i + idsChunkLen)
      var urlQuery = URL.parse(obj.url, true).query
      var query = [
        APIROOT + 'esummary.fcgi?',
        DEFAULTS,
        'db=' + urlQuery.db,
        'id=' + idsChunk.join(','),
        'usehistory=y'
      ].join('&')
      debug('esummary request', query)
      this.push(query)
    }
    next()
  }
}

function fetchByID (db) {
  var xmlProperties = XMLPROPERTIES[db] || through.obj()
  var lastStream = LASTSTREAM[db] || through.obj
  var stream = pumpify.obj(
    requestStream(true),
    tool.extractProperty('body.result'),
    tool.deleteProperty('uids'),
    tool.arraySplit(),
    tool.XMLToJSProperties(xmlProperties),
    lastStream()
  )
  return stream
}

// ## Link
// Takes a string for source NCBI database and another for destination db and returns
// a objects stream with unique IDs linked to the passed source db unique ID.
//
//     ncbi.link('taxonomy', 'sra', 443821)
//     => { "srcDB":"taxonomy",
//          "destDB":"sra",
//          "srcUID":"443821",
//
//          "destUID":"677548" }
//     => { "srcDB":"taxonomy",
//          "destDB":"sra",
//          "srcUID":"443821",
//          "destUID":"677547" }
//     => [...]
//
// Also works with write and pipe, like **Search**.

ncbi.link = function (srcDB, destDB, srcUID, cb) {
  insight.track('ncbi', 'link')
  var opts = typeof srcDB === 'string' ? { srcDB, destDB, srcUID } : srcDB
  var stream = pumpify.obj(
    createAPILinkURL(opts.srcDB, opts.destDB),
    requestStream(true),
    createLinkObj()
  )

  if (opts.srcUID) { stream.write(opts.srcUID); stream.end() }
  if (cb) { stream.on('data', cb) } else { return stream }
}

function createAPILinkURL (srcDB, destDB) {
  var stream = through.obj(transform)
  if (srcDB === 'tax') { srcDB = 'taxonomy' }
  return stream

  function transform (obj, enc, next) {
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

function createLinkObj () {
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var self = this
    var query = URL.parse(obj.url, true).query
    var result = {
      srcDB: query.dbfrom,
      destDB: query.db,
      srcUID: query.id
    }
    xml2js(obj.body, gotParsed)
    function gotParsed (err, data) {
      if (err) { self.emit('error', err); return next() }
      if (!data.eLinkResult.LinkSet[0].LinkSetDb) { return next() }
      data.eLinkResult.LinkSet[0].LinkSetDb.forEach(getMatch)
      self.push(result)
      next()
    }
    function getMatch (link) {
      var linkName = query.dbfrom + '_' + query.db
      if (link.LinkName[0] !== linkName) { return }
      var destUIDs = []
      link.Link.forEach(getLink)
      function getLink (link) { destUIDs.push(link.Id[0]) }
      result.destUIDs = destUIDs
    }
  }
}

// ## Property link (Plink)
// Similar to Link but takes the srcID from a property of the Streamed object
// and attaches the result to a property with the name of the destination DB.
//
//     ncbi.search('genome', 'arthropoda')
//     .pipe(ncbi.expand('tax'))
//     .pipe(ncbi.plink('tax', 'sra')

ncbi.plink = function (property, destDB) {
  insight.track('ncbi', 'plink')

  var opts = typeof property === 'string' ? { property, destDB } : property

  var srcDB = opts.property.split('.').pop()
  var destProperty = opts.destDB + 'id'
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var self = this
    var id = tool.getValue(obj, opts.property + 'id')
    if (!id) {
      self.push(obj)
      return next()
    }
    if (!obj[destProperty]) { obj[destProperty] = [] }
    ncbi.link(srcDB, opts.destDB, id, gotData)
    function gotData (data) {
      if (data.destUIDs) { obj[destProperty] = data.destUIDs }
      self.push(obj)
      next()
    }
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

ncbi.download = function (db, term, cb) {
  insight.track('ncbi', 'download')

  var opts = typeof db === 'string' ? { db: db, term } : db
  opts.db = opts.db
  var stream = pumpify.obj(
    ncbi.urls(opts.db),
    download(opts)
  )

  if (opts.term) { stream.write(opts.term); stream.end() }
  if (cb) { stream.pipe(concat(cb)) } else { return stream }
}

function download (db) {
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var self = this
    var folder = obj.uid + '/'

    var extractFiles = {
      'sra': function () { return obj.url },
      'gff': function () { return obj.genomic.gff },
      'gbff': function () { return obj.genomic.gbff },
      'gpff': function () { return obj.protein.gpff },
      'assembly': function () { return obj.genomic.fna },
      'fasta': function () { return obj.genomic.fna },
      'fna': function () { return obj.genomic.fna },
      'faa': function () { return obj.protein.faa },
      'repeats': function () { return obj.rm.out },
      'md5': function () { return obj.md5checksums.txt }
    }

    // added opts.db definition here since it is a local variable in ncbi.urls
    var opts = typeof db === 'string' ? { db } : db

    var url = extractFiles[opts.db]()

    var path = folder + url.replace(/.*\//, '')

    var log = {
      uid: obj.uid,
      url: url,
      path: path
    }

    mkdirp(obj.uid, {mode: '0755'}, gotDir)
    function gotDir (err) {
      if (err) { self.emit('error', err) }
      debug('downloading', url)
      var options
      if (opts.pretty === true) {
        if (fs.existsSync(path)) {
          console.log('File already exists in: ' + path + '\n')
          options = { dir: folder, resume: true, quiet: true }
        } else {
          options = { dir: folder, resume: true, quiet: false }
        }
      } else {
        options = { dir: folder, resume: true, quiet: true }
      }
      var dld = nugget(PROXY + url, options, function (err) {
        if (err) return self.destroy(err)
        fs.stat(path, gotStat)
        function gotStat (err, stat) {
          if (err) return self.destroy(err)
          log.status = 'completed'
          log.speed = 'NA'
          log.size = Math.round(stat.size / 1024 / 1024) + ' MB'
          self.push(log)
          next()
        }
      })
      if (opts.pretty !== true) {
        dld.on('progress', logging)
      }
    }

    function logging (data) {
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

ncbi.urls = function (db, term, cb) {
  insight.track('ncbi', 'urls')
  var opts = typeof db === 'string' ? { db } : db
  cb = typeof term === 'function' ? term : cb
  var extractFiles = ['gff', 'gpff', 'fasta', 'fna', 'faa', 'repeats']
  if (extractFiles.indexOf(db) !== -1) { opts.db = 'assembly' }

  var stream = pumpify.obj(
    ncbi.search(opts),
    createFTPURL(opts.db)
  )
  if (term) { stream.write(term); stream.end() }
  if (cb) { stream.pipe(concat(cb)) } else { return stream }
}

function createFTPURL (db) {
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var self = this
    var parseURL = {
      sra: sraURL,
      assembly: assemblyURL
    }

    parseURL[db]()

    function sraURL () {
      var runs = obj.runs.Run
      async.eachSeries(runs, printSRAURL, next)
      function printSRAURL (run, cb) {
        var acc = run.acc
        var runURL = [
          'http://ftp.ncbi.nlm.nih.gov/sra/sra-instant/reads/ByRun/sra/',
          acc.slice(0, 3) + '/',
          acc.slice(0, 6) + '/',
          acc + '/',
          acc + '.sra'
        ].join('')
        self.push({url: runURL, uid: obj.uid})
        cb()
      }
    }

    function assemblyURL () {
      if (obj.meta.FtpSites) {
        var ftpPath = obj.meta.FtpSites.FtpPath
        var ftpArray = Array.isArray(ftpPath) ? ftpPath : [ ftpPath ]
        // NCBI seems to return GenBank and RefSeq accessions for the same thing. We only need one.
        var httpRoot = ftpArray[0]._
          .replace('ftp://', 'http://')
          .split('/').slice(0, -1).join('/')
        request({ uri: PROXY + httpRoot, withCredentials: false }, gotFTPDir)
      } else { return next() }
      function gotFTPDir (err, res, body) {
        if (err) { self.emit('error', err) }
        if (!res || res.statusCode !== 200) { self.emit('err', res) }
        if (!body) { return next() }
        var $ = cheerio.load(body)

        var urls = { uid: obj.uid }

        $('a').map(attachToResult)
        function attachToResult (i, a) {
          var href = a.attribs.href
          var base = path.basename(href)
          var basename = path.basename(httpRoot)
          var fileNameProperties = base.replace(new RegExp('.*' + basename + '_'), '')
          var fileNameExtensions = fileNameProperties.split('.')
          var fileType = fileNameExtensions[0]
          var fileFormat = fileNameExtensions[1] || 'dir'
          if (!urls[fileType]) { urls[fileType] = {} }
          urls[fileType][fileFormat] = httpRoot + '/' + href
        }
        self.push(urls)
        next()
      }
    }
  }
}

function requestStream (returnURL) {
  var timeout = 15000
  var interval = 0
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var self = this
    get()
    self.tries = 1
    function get () {
      if (self.tries > 9) {
        self.emit('error', new Error(
          `Query failed after ${self.tries} tries, maybe a term or network issue?
This is what failed: ${obj}`)
        )
      }
      request({ uri: obj, json: true, timeout: timeout, withCredentials: false }, gotData)
      function gotData (err, res, body) {
        if (err ||
          !res ||
          res.statusCode !== 200 ||
          !body ||
          (body.esearchresult && body.esearchresult.ERROR) ||
          (body.esummaryresult && body.esummaryresult[0] === 'Unable to obtain query #1') ||
          body.error
        ) {
          self.tries++
          return setTimeout(get, interval)
        }
        debug('request response', res.statusCode)
        debug('request results', body)
        var result = returnURL ? {url: obj, body: body} : body
        self.push(result)
        setTimeout(next, interval)
      }
    }
  }
}

// ## Expand
// Takes a property (e.g., biosample) and optional destination property
// (e.g., sample) and looks for a field named property+id (biosampleid)
// in the Streamed object. Then it will do a ncbi.search for that id and save
// the result under Streamed object.property.
//
//     ncbi.search('genome', 'arthropoda').pipe(ncbi.expand('assembly'))

ncbi.expand = function (property, destProperty) {
  insight.track('ncbi', 'expand')
  var opts = typeof property === 'string' ? { property, destProperty } : property
  opts.destProperty = opts.destProperty || opts.property
  var db = opts.property.split('.').pop()
  if (db === 'tax') { db = 'taxonomy' }

  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var self = this
    var ids = tool.getValue(obj, opts.property + 'id')
    if (!ids) {
      self.push(obj)
      return next()
    }

    // Taxonomy doesn't work just with ID number
    if (db === 'taxonomy') { ids = ids + '[uid]' }

    if (Array.isArray(ids)) {
      async.map(ids, search, gotData)
    } else {
      search(ids, gotData)
    }

    function search (term, cb) {
      var stream = ncbi.search(db)
      stream.write(term)
      stream.on('data', function (data) { cb(null, data) })
      stream.on('end', next)
    }

    function gotData (err, data) {
      if (err) { throw new Error(err) }
      obj[opts.destProperty] = data
      self.push(obj)
      next()
    }
  }
}

// ## Fetch
// Allows retrieval of records from NCBI databases. Takes the database name and a search term,
// and returns the records from the database that match the search term. There are optional
// advanced parameters that allow you to define how many records to retrieve and extra options
// for genes. These parameters should be passed as an object.
//
// It can return a subset of a genetic sequence of a requested species
//
//      ncbi.fetch('sra', 'solenopsis_invicta')
//      => {"EXPERIMENT_PACKAGE_SET":
//            {"EXPERIMENT_PACKAGE":
//              [{"EXPERIMENT":
//                [{"$":{"xmlns":"","alias":"Me","accession":"SRX757228,
//                ...
//
// With advanced optional parameters:
//
//      var opts = {
//        db: 'nucest',
//        term: 'guillardia_theta',
//        strand: 1,
//        complexity: 4,
//        seq_start: 1,
//        seq_stop: 50
//      }
//
//      ncbi.fetch(opts)
//      => { id: 'gi|557436392|gb|HE992975.1|HE992975:1-50 HE992975 Guillardia theta CCMP 327 Guillardia theta cDNA clone sg-p_014_h06, mRNA sequence',
//           seq: 'GAAGGCGATTCCAATGGTGCGAGCGAGGCAGCGAACAGACGCAGCGGGGA' }
//         { id: 'gi|557436391|gb|HE992974.1|HE992974:1-50 HE992974 Guillardia theta CCMP 327 Guillardia theta cDNA clone sg-p_014_h05, mRNA sequence',
//           seq: 'GTCGCGGTTGGCATGGCTGAGGAGAATCCGATCCCTCGGCTAGACGCCTG' }
//      => [...]
// For some databases there are multiple return types. A default one will be chosen
// automatically, however it is possible to specify this via the rettype option.
//
// The NCBI website provides a list of databasese supported by efetch here:
// http://www.ncbi.nlm.nih.gov/books/NBK25497/table/chapter2.T._entrez_unique_identifiers_ui/?report=objectonly

ncbi.fetch = function (db, term, cb) {
  insight.track('ncbi', 'fetch')
  var opts = typeof db === 'string' ? { db: db, term: term } : db
  cb = typeof term === 'function' ? term : cb

  var rettypes = {
    bioproject: 'xml',
    biosample: 'full',
    biosystems: 'xml',
    gds: 'summary',
    gene: '',
    homologene: 'fasta',
    mesh: 'full',
    nlmcatalog: 'xml',
    nuccore: 'fasta',
    nucest: 'fasta',
    nucgss: 'fasta',
    protein: 'fasta',
    popset: 'fasta',
    pmc: '',
    pubmed: '',
    snp: 'fasta',
    sra: 'full',
    taxonomy: ''
  }

  var retmodes = {
    fasta: 'fasta',
    'native': 'xml',
    full: 'xml',
    xml: 'xml',
    '': 'xml',
    'asn.1': 'asn.1'
  }

  opts.rettype = opts.rettype || rettypes[opts.db]
  opts.retmode = retmodes[opts.rettype] || 'text'

  var stream = pumpify.obj(
      createAPISearchUrl(opts.db, opts.term),
      requestStream(true),
      createAPIPaginateURL(opts),
      requestStream(true),
      createAPIFetchUrl(opts, stringifyExtras(opts)),
      parseResult(opts.retmode)
  )

  if (opts.term) { stream.write(opts.term); stream.end() }
  if (cb) { stream.pipe(concat(cb)) } else { return stream }
}

function stringifyExtras (opts) {
  var extraOptsLine = ''

  for (var k in opts) {
    if ((k !== 'term') && (k !== 'db')) {
      extraOptsLine += k + '=' + opts[k] + '&'
    }
  }

  return extraOptsLine.slice(0, -1)
}

function createAPIFetchUrl (opts, extraOpts) {
  var stream = through.obj(transform)
  return stream

  function transform (obj, enc, next) {
    var idsChunkLen = 50
    var idlist = obj.body.esearchresult.idlist
    if (!idlist || idlist.length === 0) { return next() }
    for (var i = 0; i < idlist.length; i += idsChunkLen) {
      var idsChunk = idlist.slice(i, i + idsChunkLen)
      var urlQuery = URL.parse(obj.url, true).query
      var query = [
        APIROOT + 'efetch.fcgi?',
        'version=2.0',
        'db=' + urlQuery.db,
        'id=' + idsChunk.join(','),
        extraOpts,
        'userhistory=y'
      ].join('&')
      debug('efetch request', query)
      this.push(query)
    }
    next()
  }
}

function parseResult (resFmt) {
  var lastStream = (resFmt === 'fasta') ? fasta.obj : through.obj

  var stream = pumpify.obj(
      requestStream('true'),
      preProcess(),
      lastStream()
  )

  return stream

  function preProcess () {
    var stream = through.obj(transform)
    return stream

    function transform (chunk, enc, cb) {
      var self = this
      if (resFmt === 'xml') {
        xml2js(chunk.body, function (err, data) {
          if (err) { self.emit('error', err); return cb() }
          self.push(data)
          cb()
        })
      } else if (resFmt === 'fasta') {
        self.push(chunk.body)
        cb()
      } else {
        self.push({result: chunk.body})
        cb()
      }
    }
  }
}
