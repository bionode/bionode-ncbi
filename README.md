<p align="center">
  <a href="http://bionode.io">
    <img height="200" width="200" title="bionode" alt="bionode logo" src="https://rawgithub.com/bionode/bionode/master/docs/bionode-logo.min.svg"/>
  </a>
  <br/>
  <a href="http://bionode.io/">bionode.io</a>
</p>
# bionode-ncbi
> Node.js module for working with the NCBI API (aka e-utils).

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Coveralls Status][coveralls-image]][coveralls-url]
[![Dependency Status][depstat-image]][depstat-url]
[![Gitter chat][gitter-image]][gitter-url]
[![DOI][doi-image]][doi-url]

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
$ bionode-ncbi search sra human --limit 10 # or just -l
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

### Contributors
Please see the file [contributors.md](contributors.md) for a list.

Contacts
--------
Bruno Vieira <[mail@bmpvieira.com](mailto:mail@bmpvieira.com)> [@bmpvieira](//twitter.com/bmpvieira)

Yannick Wurm ([yannick.poulet.org](http://yannick.poulet.org)) [@yannick__](//twitter.com/yannick__)

Licenses
--------

bionode-ncbi is licensed under the [MIT](https://raw.github.com/bionode/bionode-ncbi/master/LICENSE) license.  
Check [ChooseALicense.com](http://choosealicense.com/licenses/mit) for details.

[npm-url]: http://npmjs.org/package/bionode-ncbi
[npm-image]: http://img.shields.io/npm/v/bionode-ncbi.svg?style=flat
[travis-url]: http:////travis-ci.org/bionode/bionode-ncbi
[travis-image]: http://img.shields.io/travis/bionode/bionode-ncbi.svg?style=flat
[coveralls-url]: http:////coveralls.io/r/bionode/bionode-ncbi
[coveralls-image]: http://img.shields.io/coveralls/bionode/bionode-ncbi.svg?style=flat
[depstat-url]: http://david-dm.org/bionode/bionode-ncbi
[depstat-image]: http://img.shields.io/david/bionode/bionode-ncbi.svg?style=flat
[gitter-image]: http://img.shields.io/badge/gitter-bionode/bionode--ncbi-brightgreen.svg?style=flat
[gitter-url]: https://gitter.im/bionode/bionode-ncbi
[doi-url]: http://dx.doi.org/10.5281/zenodo.11315
[doi-image]: http://img.shields.io/badge/doi-10.5281/zenodo.11315-blue.svg?style=flat
