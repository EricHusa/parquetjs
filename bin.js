#! /usr/bin/env node

var hexpp = require('hexpp')
var fs = require('fs')
var decode = require('./decode')

function open (file) {
  return file === typeof number ? file : fs.openSync(file)
}

function open (file, cb) {
  fs.open(file, 'r', function (err, fd) {
    if(err) return cb(err)
    fs.stat(file, function (err, stat) {
      if(err) return cb(err)
      cb(null, {filename: file, fd: fd, size: stat.size})
    })
  })
}

function read (file, start, end, cb) {
  if('string' == typeof file)
    open(file, next)
  else if(file && 'object' == typeof file)
    next(null, file)
  else
    throw new Error('unknown type:'+JSON.stringify(file))

  function next (err, opts) {
    if(err) return cb(err)

    //handle regative lengths from the end.
    if(start < 0) start = opts.size - ~start
    if(end < 0) end = opts.size - ~end
    var buffer = new Buffer(end - start)
    fs.read(opts.fd, buffer, 0, buffer.length, start, function (err) {
      cb(err, buffer, opts)
    })
  }

}

module.exports = function (file, cb) {
  read(file, ~8, ~0, function (err, footerLength, opts) {
    if(err) return cb(err)
    read(opts, ~(footerLength.readUInt32LE(0) + 8), ~8,
      function (err, footer) {
      var fmd = decode.FileMetaData(footer)
      cb(null, fmd, opts)
    })
  })
}

function dump (data) {
  console.log(JSON.stringify(data, null, 2))
}

if(!module.parent) {
  var opts = require('minimist')(process.argv.slice(2))
  var filename = opts._.shift()

  if(!filename) throw new Error('filename must be provided')
  module.exports(filename, function (err, data, file) {
    if(err) throw err
    if(opts.meta) dump(data)
    if(opts.schema) dump(data.schema)
    if(opts.row_group != null)
      dump(data.row_groups[+opts.row_group])
    if(opts.column != null) {
      console.log(opts)
      var rg = data.row_groups[0]
      var column = rg.columns[opts.column]
      console.log(
        column.file_offset,
        column.file_offset + column.meta_data.total_compressed_size
      )
      //data_page_offset is the same as file_offset (it's for dealing with multiple files, I guess)
      //console.log('data_page_offset', column.meta_data.data_page_offset)
      read(
        file,
        +column.file_offset,
        column.file_offset + column.meta_data.total_compressed_size,
        function (err, buf) {
          if(err) throw err
          console.log(data.schema[1+opts.column])
          console.log(column)
          var ph =decode.PageHeader(buf)
          console.log('PageHeader', ph)
          var body = buf.slice(decode.bytes, decode.bytes+ph.compressed_page_size)
//          console.log(hexpp(body.slice(4, 4+body.readUInt32LE(0))))
//          console.log("REST")
//          console.log(hexpp(4+body.slice(body.readUInt32LE(0))))
          console.log('WHOLE')
          console.log(hexpp(body))
          if(ph.type === 2)
            console.log(require('./encodings/plain').decode(body, 0))
//          console.log(hexpp(4+body.slice(body.readUInt32LE(0))))
//          console.log('BUF')
//          console.log(hexpp(buf.slice(decode.bytes+ph.compressed_page_size))) //.slice(decode.bytes+ph.compressed_page_size)))
          //if dictionary type
          if(ph.type == 2) {
            var data_page_start = decode.bytes+ph.compressed_page_size
            console.log(decode.PageHeader(buf.slice(data_page_start)))
            console.log(hexpp(buf.slice(data_page_start + decode.bytes)))
          }
        })
    }
  })
}

