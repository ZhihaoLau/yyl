'use strict';
var require = {
    // baseUrl: '../js',
    paths: {

        // for demo
        'rDemo' : '../../components/r-demo/r-demo',
        // global
        'jquery' : '../../js/lib/jQuery/jquery-1.11.3.min'
        // + yyl make
        // - yyl make
    },
    shim: {
        // artTemplate: {
        //     exports: 'artTemplate'
        // }
    }
};

if(typeof module === "object" && typeof module.exports === 'object'){
    module.exports = require;
}
