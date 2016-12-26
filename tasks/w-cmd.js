'use strict';
var 
    util = require('../lib/yyl-util'),
    color = require('../lib/colors'),
    vars = util.vars;


var 
    events = {
        version: require('./w-version'),
        init: require('./w-init'),
        optimize: require('./w-optimize'),
        server: require('./w-server'),
        test: require('./w-test'),
        commit: require('./w-commit'),
        update: require('./w-update'),
        help: function(){
            util.help({
                usage: 'yyl',
                commands: {
                    'init': 'init commands',
                    'watch': 'watch task',
                    'all': 'optimize task',
                    'server': 'local server commands',
                    'update': 'update yyl workflow'
                },
                options: {
                    '-h, --help': 'print usage information',
                    '-v, --version': 'print yyl version',
                    '-p, --path': 'show the yyl command local path'
                }
            });
        },
        path: function(){
            console.log([
                '',
                'yyl command path:',
                color.yellow(vars.BASE_PATH),
                ''
            ].join('\n'));

            util.openPath(vars.BASE_PATH);

        }
    };


module.exports = function(ctx){
    var 
        iArgv = util.makeArray(arguments);

    var iVer = process.versions.node;
    if(iVer.localeCompare('4.0.0') < 0){
        return util.msg.error('please makesure your node >= 4.0.0');

    }

    switch(ctx){
        case '-v': 
        case '--version':
            events.version();
            break;


        case '-h':
        case '--help':
            events.help();
            break;

        case '--path':
        case '-p':
            events.path();
            break;

        case 'init':
            events.init.apply(events, iArgv);
            break;

        case 'update':
            events.update.apply(events, iArgv);
            break;

        case 'html':
        case 'js':
        case 'css':
        case 'images':
        case 'watch':
        case 'watchAll':
        case 'all':
        case 'connect':
        case 'concat':
            events.optimize.apply(events, iArgv);
            break;

        case 'server':
            events.server.run.apply(events.server, iArgv);
            break;

        case 'commit':
            events.commit.run.apply(events.commit, iArgv);
            break;

        case 'test':
            events.test();
            break;

        default:
            events.help();
            break;
    }
};
