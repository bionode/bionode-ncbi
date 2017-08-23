
var dbs = {
  gquery: 'All Databases',
  assembly: 'Assembly',
  bioproject: 'BioProject',
  biosample: 'BioSample',
  biosystems: 'BioSystems',
  books: 'Books',
  clinvar: 'ClinVar',
  clone: 'Clone',
  cdd: 'Conserved Domains',
  gap: 'dbGaP',
  dbvar: 'dbVar',
  nucest: 'EST',
  gene: 'Gene',
  genome: 'Genome',
  gds: 'GEO DataSets',
  geoprofiles: 'GEO Profiles',
  nucgss: 'GSS',
  gtr: 'GTR',
  homologene: 'HomoloGene',
  medgen: 'MedGen',
  mesh: 'MeSH',
  ncbisearch: 'NCBI Web Site',
  nlmcatalog: 'NLM Catalog',
  nuccore: 'Nucleotide',
  omim: 'OMIM',
  pmc: 'PMC',
  popset: 'PopSet',
  probe: 'Probe',
  protein: 'Protein',
  proteinclusters: 'Protein Clusters',
  pcassay: 'PubChem BioAssay',
  pccompound: 'PubChem Compound',
  pcsubstance: 'PubChem Substance',
  pubmed: 'PubMed',
  pubmedhealth: 'PubMed Health',
  snp: 'SNP',
  sparcle: 'Sparcle',
  sra: 'SRA',
  structure: 'Structure',
  taxonomy: 'Taxonomy',
  toolkit: 'ToolKit',
  toolkitall: 'ToolKitAll',
  toolkitbook: 'ToolKitBook',
  toolkitbookgh: 'ToolKitBookgh',
  unigene: 'UniGene'
}

function printDbs (dbsObject) {
  dbsObject = dbsObject || dbs

  var keys = Object.keys(dbsObject)
  return keys.reduce((acc, k, i) => {
    acc = acc + k + ' (' + dbsObject[k] + ')'
    if (i < keys.length - 1) {
      acc = acc + '\n'
    }
    return acc
  }, '')
}

function InvalidDbError (msg) {
  this.name = 'InvalidDbError'
  this.message = msg
}

InvalidDbError.prototype = new Error('Invalid database')

module.exports.dbs = dbs
module.exports.InvalidDbError = InvalidDbError
module.exports.printDbs = printDbs
