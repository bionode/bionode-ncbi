#!/usr/bin/env node
var minimist = require('minimist')
var JSONStream = require('JSONStream')
var ncbi = require('./')

var minimistOptions = {
  alias: {
    limit: 'l',
    throughput: 't'
  }
}

var argv = minimist(process.argv.slice(2), minimistOptions)

var command = argv._[0]
var arg1 = argv._[1]
var lastArg = argv._[argv._.length - 1]

if (command === 'link') {
  var arg2 = argv._[2]
  var arg3 = argv._[3]
}
else {
  var arg2 = argv._.slice(2).join(' ')
  var arg3 = null
}

var options
if (Object.keys(argv).length > 1) {
  options = {
    limit: argv.limit,
    throughput: argv.throughput,
    db: arg1,
    term: arg2
  }
}


var ncbiStream = options ? ncbi[command](options) : ncbi[command](arg1, arg2, arg3)

ncbiStream.pipe(JSONStream.stringify(false)).pipe(process.stdout)

if (lastArg === '-') {
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', function(data) {
    if (data.trim() === '') { return }
    ncbiStream.write(data.trim())
  })
}

