<p align="center">
  <a href="http://bionode.io">
    <img height="200" width="200" title="bionode" alt="bionode logo" src="https://rawgithub.com/bionode/bionode/master/docs/bionode-logo.min.svg"/>
  </a>
  <br/>
  <a href="http://bionode.io/">bionode.io</a>
</p>
# bionode-ncbi [![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Coveralls Status][coveralls-image]][coveralls-url] [![Dependency Status][depstat-image]][depstat-url] [![DOI][doi-image]][doi-url]


> Node.js module for working with the NCBI API (aka e-utils).


Install
-------

Install ```bionode-ncbi``` with [npm](//npmjs.org):

```sh
$ npm install bionode-ncbi
```
To use it as a command line tool, you can install it globally by adding ```-g``` .


Usage
-----

If you are using ```bionode-ncbi``` with Node.js, you can require the module:

```js
var ncbi = require('bionode-ncbi')
ncbi.search('sra', 'solenopsis').on('data', console.log)
```

Please read the [documentation](http://rawgit.com/bionode/bionode-ncbi/master/docs/bionode-ncbi.html) for the methods exposed by bionode.

### Command line examples
```sh
$ bionode-ncbi search taxonomy solenopsis
$ bionode-ncbi download assembly solenopsis invicta
$ bionode-ncbi urls sra solenopsis invicta
$ bionode-ncbi link assembly bioproject 244018
```

### Usage with [Dat](http://dat-data.com)
```sh
bionode-ncbi search gds solenopsis | dat import --json
```

Contributing
------------

To contribute, clone this repo locally and commit your code on a separate branch.

Please write unit tests for your code, and check that everything works by running the following before opening a pull-request:

```sh
$ npm test
```

Please also check for code coverage:

```sh
$ npm run coverage
```

To rebuild the documentation using the comments in the code:

```sh
$ npm run build-docs
```
Check the [issues](http://github.com/bionode/bionode-ncbi/issues) for ways to contribute.

Contacts
--------
Bruno Vieira <[mail@bmpvieira.com](mailto:mail@bmpvieira.com)> [@bmpvieira](//twitter.com/bmpvieira)

Yannick Wurm ([yannick.poulet.org](http://yannick.poulet.org)) [@yannick__](//twitter.com/yannick__)

Licenses
--------

bionode-ncbi is licensed under the [MIT](https://raw.github.com/bionode/bionode-ncbi/master/LICENSE) license.  
Check [ChooseALicense.com](http://choosealicense.com/licenses/mit) for details.

[npm-url]: http://npmjs.org/package/bionode-ncbi
[npm-image]: http://badge.fury.io/js/bionode-ncbi.png
[travis-url]: http://travis-ci.org/bionode/bionode-ncbi
[travis-image]: http://travis-ci.org/bionode/bionode-ncbi.png?branch=master
[coveralls-url]: http://coveralls.io/r/bionode/bionode-ncbi
[coveralls-image]: http://coveralls.io/repos/bionode/bionode-ncbi/badge.png
[depstat-url]: http://david-dm.org/bionode/bionode-ncbi
[depstat-image]: http://david-dm.org/bionode/bionode-ncbi.png
[doi-url]: http://dx.doi.org/10.5281/zenodo.10610
[doi-image]: https://zenodo.org/badge/3959/bionode/bionode-ncbi.png

[![Bitdeli Badge](http://d2weczhvl823v0.cloudfront.net/bionode/bionode-ncbi/trend.png)](https://bitdeli.com/free "Bitdeli Badge")
