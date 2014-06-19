var JSONStream = require('JSONStream')
var ncbi = require('./')

var args = process.argv.slice(2)

var command = args[0]
var arg1 = args[1]

if (command === 'link') {
  var arg2 = args[2]
  var arg3 = args[3]
}
else {
  var arg2 = args.slice(2).join(' ')
  var arg3 = null
}

var ncbiStream = ncbi[command](arg1, arg2, arg3)

ncbiStream.pipe(JSONStream.stringify(false)).pipe(process.stdout)
