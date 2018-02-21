'use strict';
var path = require('path');
var fs = require('fs');

var util = require('./w-util.js');
var wServer = require('./w-server');
var log = require('./w-log');

var
  wOptimize = function() {
    var iArgv = util.makeArray(arguments);
    var iEnv = util.envPrase(iArgv);

    if (iEnv.logLevel) {
      wServer.setLogLevel(iEnv.logLevel, true);
    }

    if (iEnv.silent) {
      wServer.setLogLevel(2, true);
    }

    new util.Promise((next) => {
      log('clear');
      log('start', 'server', 'server init...');
      log('msg', 'info', 'build server config start');
      wServer.buildConfig(iEnv.name, iEnv, (err, config) => { // 创建 server 端 config
        if (err) {
          log('msg', 'error', ['build server config error:', err]);
          return log('finish');
        }

        log('msg', 'success', 'build server config finished');
        next(config);
      });
    }).then((config, next) => { // 检测 版本
      const yylPkg = util.requireJs(util.path.join(__dirname, '../package.json'));
      if (util.compareVersion(config.version, yylPkg.version) > 0) {
        log('msg', 'error', `optimize fail, project require yyl at least ${config.version}`);
        log('msg', 'warn', 'please update your yyl: npm install yyl -g');
        log('finish');
        return;
      } else {
        next(config);
      }
    }).then((config, next) => { // 清除 localserver 目录下原有文件
      if (fs.existsSync(config.localserver.root)) {
        log('msg', 'info', `clean Path start: ${config.localserver.root}`);
        util.removeFiles(config.localserver.root, () => {
          log('msg', 'success', `clean path finished: ${config.localserver.root}`);
          next(config);
        });
      } else {
        next(config);
      }
    }).then((config, next) => { // server init
      if (/watch/.test(iArgv[0])) {
        if (config.localserver.port) {
          util.checkPortUseage(config.localserver.port, (canUse) => {
            if (canUse) {
              util.runCMD('yyl server start', () => {
                next(config);
              }, util.vars.PROJECT_PATH, true, true);
            } else {
              log('msg', 'warn', `port ${config.localserver.port} is occupied, yyl server start failed`);
              next(config);
            }
          });
        } else {
          log('msg', 'info', 'config.localserver.port is not setted, next');
          next(config);
        }
      } else {
        next(config);
      }
    }).then((config) => { // 运行命令
      const initPath = util.path.join(__dirname, '../init-files', config.workflow, 'index.js');
      if (fs.existsSync(initPath)) {
        log('finish');
        const opzer = require(initPath);
        opzer(config, iArgv[0], iEnv).then(() => {
          if (global.YYL_RUN_CALLBACK) { // yyl.run 用 callback
            setTimeout(global.YYL_RUN_CALLBACK, 0);
          }
        });
      } else {
        log('msg', 'info', 'run cmd start');

        var workFlowPath = path.join(util.vars.SERVER_WORKFLOW_PATH, config.workflow);
        var gulpHand = util.joinFormat(
          workFlowPath,
          'node_modules',
          '.bin',
          util.vars.IS_WINDOWS? 'gulp.cmd': 'gulp'
        );

        var cmd = `${gulpHand} ${iArgv.join(' ')}`;

        log('msg', 'info', `run cmd: ${cmd}`);
        log('finish');
        util.runSpawn(cmd, (err) => {
          if (err) {
            return util.msg.error(iArgv[0], 'task run error', err);
          }
          if (global.YYL_RUN_CALLBACK) { // yyl.run 用 callback
            setTimeout(global.YYL_RUN_CALLBACK, 0);
          }
        }, workFlowPath);
      }
    }).start();
  };


module.exports = wOptimize;

