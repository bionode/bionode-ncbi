#!/usr/bin/env node
var JSONStream = require('JSONStream')
var split = require('split2')
var ncbi = require('./')
var insight = require('./lib/anonymous-tracking')
var validDbs = require('./lib/valid-dbs')

var argv = require('yargs')
.strict()
.demandCommand(1)
.version()
.help()
.alias('help', 'h')
.alias('verbose', 'v')
.epilogue('For more information, check our documentation at http://doc.bionode.io')
.usage('Usage: bionode-ncbi <command> [arguments] --limit [num] --pretty')
.command(
  'search <db> [term]',
  `Takes a database name and a query term. Returns the metadata.`
)
.example('search', `taxonomy 'solenopsis invicta'`)
.example('search', `sra human --limit 1 --pretty`)
.command(
  'fetch <db> [term]',
  `Takes a database name and a query term. Returns the data.`
)
.example('fetch', `nucest p53 -l 1 --pretty`)
.command(
  'urls <dlsource> [term]',
  `Takes either sra or assembly db name and query term. Returns URLs of datasets.`
)
.example('urls', `sra solenopsis invicta`)
.example('urls', `assembly solenopsis invicta | json genomic.fna`)
.command(
  'download <dlsource> [term]',
  `Takes either sra or assembly db name and query term. Downloads the corresponding \
SRA or assembly (genomic.fna) file into a folder named after the unique ID (UID).`
)
.example('download', `assembly solenopsis invicta --pretty`)
.command(
  'link <srcDB> <destDB> [srcUID]',
  `Returns a unique ID (UID) from a destination database linked to another UID \
from a source database.`
)
.example('link', `assembly bioproject 244018 --pretty`)
.command(
  'expand <property> [destProperty]',
  `Takes a property (e.g. biosample) and an optional destination property
(e.g. sample) and looks for a field named property+id (e.g. biosampleid)
in the Streamed object. Then it will do a ncbi.search for that id and save the
result under Streamed object.property.`
)
.example('expand',
  `bionode-ncbi search genome 'solenopsis invicta' -l 1 | \\
bionode-ncbi expand tax -s --pretty`
)
.command(
  'plink <property> <destDB>',
  `Similar to Link but takes the srcUID from a property of the Streamed object
and attaches the result to a property with the name of the destination DB.`
)
.example('plink',
`bionode-ncbi search genome 'solenopsis invicta' -l 1 | \\
bionode-ncbi expand tax -s | \\
bionode-ncbi plink tax sra -s --pretty`
)
.alias('stdin', 's')
.boolean('stdin')
.describe('stdin', 'Read STDIN')
.alias('limit', 'l')
.number('limit')
.describe('limit', 'Limit number of results')
.alias('throughput', 't')
.number('throughput')
.describe('throughput', 'Number of items per API request')
.alias('pretty', 'p')
.boolean('pretty')
.describe('pretty', 'Print human readable output instead of NDJSON')
.choices('dlsource', ['assembly', 'sra'])
.choices('db', Object.keys(validDbs.dbs))
.example('databases available', validDbs.printDbs())
.example(`DEBUG mode: export DEBUG='*'`)
.argv

if (argv.dlsource) { argv.db = argv.dlsource }

insight.track('ncbi', 'cli')

try {
  var ncbiStream = ncbi[argv._[0]](argv)

  var jsonStream
  if (argv.pretty) {
    jsonStream = JSONStream.stringify(false, null, null, 2)
  } else {
    jsonStream = JSONStream.stringify(false)
  }

  ncbiStream.pipe(jsonStream).pipe(process.stdout)

  if (argv.stdin) {
    insight.track('ncbi', 'stdin')
    process.stdin.setEncoding('utf8')

    process.stdin
    .pipe(split())
    .pipe(JSONStream.parse())
    .pipe(ncbiStream)

    process.stdin.on('end', function () {
      ncbiStream.end()
    })
  }

  process.stdout.on('error', function (err) {
    if (err.code === 'EPIPE') { process.exit(0) }
  })

  ncbiStream.on('error', function (error) {
    console.error(error.message)
    process.exit()
  })
} catch (err) {
  if (err instanceof validDbs.InvalidDbError) {
    console.error(err.message)
    console.log('Run "bionode-ncbi --help" to check the available dbs')
  } else {
    console.error(err)
  }
}
