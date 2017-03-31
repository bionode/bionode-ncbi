#!/usr/bin/env node
var minimist = require('minimist')
var JSONStream = require('JSONStream')
var split = require('split2')
var ncbi = require('./')
var insight = require('./lib/anonymous-tracking')

insight.track('ncbi', 'cli')

var minimistOptions = {
  alias: {
    limit: 'l',
    throughput: 't',
    help: 'h'
  }
}

var jsonPattern = /\{(.+?)\}/,
  args = process.argv.slice(2).join(' '),
  options = {},
  match = args.match(jsonPattern)

if (match) {
  var jsonLine = match[0].replace(/\'/g, '\"'),
    options = JSON.parse(jsonLine),
    args = args.replace(match[0], 'obj')
}

var argv = minimist(args.split(' '), minimistOptions)

if (argv.help || argv._.length === 0) {
  console.log('Please check the documentation at http://doc.bionode.io')
  process.exit()
}

var command = argv._[0]
var arg1 = argv._[1]
var lastArg = argv._[argv._.length - 1]
var wantsStdin = false
if (lastArg === '-') {
  wantsStdin = true
  argv._.pop()
}

if (command === 'link') {
  var arg2 = argv._[2]
  var arg3 = argv._[3]
} else {
  var arg2 = argv._.slice(2).join(' ')
  var arg3 = null
}

if (Object.keys(argv).length > 1) {
  options.limit = argv.limit
  options.throughput = argv.throughput

  if (arg1 !== 'obj') {
    options.db = arg1
    options.term = arg2
  }
}

var ncbiStream = Object.keys(options).length ? ncbi[command](options) : ncbi[command](arg1, arg2, arg3)

ncbiStream.pipe(JSONStream.stringify(false)).pipe(process.stdout)

if (wantsStdin) {
  insight.track('ncbi', 'stdin')
  process.stdin.setEncoding('utf8')

  process.stdin.pipe(split()).on('data', function (data) {
    if (data.trim() === '') { return }
    ncbiStream.write(data.trim())
  })
  process.stdin.on('end', function () {
    ncbiStream.end()
  })
}

process.stdout.on('error', function (err) {
  if (err.code === 'EPIPE') { process.exit(0) }
})
