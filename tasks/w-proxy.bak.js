'use strict';
const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');
const chalk = require('chalk');
const tls = require('tls');
const EasyCert = require('node-easy-cert');
const request = require('request');

const log = require('./w-log.js');
const util = require('./w-util.js');

util.mkdirSync(util.vars.SERVER_PATH);
const easyCert = new EasyCert({
  rootDirPath: util.vars.SERVER_CERTS_PATH,
  defaultCertAttrs: [
    { name: 'countryName', value: 'CN' },
    { name: 'organizationName', value: 'AnyProxy' },
    { shortName: 'ST', value: 'SH' },
    { shortName: 'OU', value: 'AnyProxy SSL Proxy' }
  ]
});

// var PROXY_INFO_HTML = [
//   '<div id="YYL_PROXY_INFO" style="position: fixed; z-index: 10000; bottom: 10px; right: 10px; padding: 0.2em 0.5em; background: #000; background: rgba(0,0,0,.5); font-size: 1.5em; color: #fff;">yyl proxy</div>',
//   '<script>setTimeout(function(){ var el = document.getElementById("YYL_PROXY_INFO"); try{el.parentNode.removeChild(el)}catch(er){} }, 10000)</script>'
// ].join('');

var fn = {
  hideProtocol: function(url) {
    return url.replace(/^http[s]?:/, '');
  },
  blank: function(num) {
    return new Array(num + 1).join(' ');
  },
  log: {
    STRING_COUNT: 55,
    u: function(obj) {
      const type = cache.index++ % 2 ? 'proxy' : 'proxy2';
      if (obj.src === obj.dest) {
        obj.dest = 'remote';
      }
      let printUrl = '';
      const iUrl = url.parse(obj.src);

      const max = 20;
      if (iUrl.search && iUrl.search.length > max) {
        iUrl.search = `${iUrl.search.substr(0, max - 3)}...`;
        printUrl = `${iUrl.protocol}//${iUrl.hostname}${iUrl.port? `:${iUrl.port}` : ''}${iUrl.pathname}${iUrl.search}${iUrl.hash || ''}`;
      } else {
        printUrl = obj.src;
      }

      let printStatus;
      switch (`${obj.status}`.substr(0, 1)) {
        case '2':
          printStatus = chalk.green(obj.status);
          break;

        case '3':
          printStatus = chalk.yellow(obj.status);
          break;

        case '4':
          printStatus = chalk.gray(obj.status);
          break;

        case '5':
          printStatus = chalk.red(obj.status);
          break;

        default:
          printStatus = chalk.gray(obj.status);
          break;
      }


      util.infoBar.print(type, {
        barLeft: [
          `=> ${chalk.cyan(printUrl)}`,
          `<= ${printStatus} ${chalk.yellow(obj.dest)}`
        ]
      }).end();
    }
  },
  createHttpsServer(op, oreq, socket, head, done) {
    const addr = oreq.url.split(':');
    let needProxy = false;
    Object.keys(op.localRemote).map((key) => {
      if (addr[0] === url.parse(key).hostname) {
        needProxy = true;
        return true;
      }
    });


    if (!needProxy) { // TODO 暂时想不到 判断 ws wss 的方法
      //creating TCP connection to remote server
      var conn = net.connect(addr[1] || 443, addr[0], () => {
        // tell the client that the connection is established
        socket.write(`HTTP/${oreq.httpVersion} 200 OK\r\n\r\n`, 'UTF-8', () => {
          // creating pipes in both ends
          conn.pipe(socket);
          socket.pipe(conn);
        });
      });

      socket.on('error', () => {
        socket.end();
        conn.end();
      });

      conn.on('error', () => {
        socket.end();
        conn.end();
      });
    } else {
      const srvUrl = url.parse(`http://${oreq.url}`);
      let srvSocket = null;
      easyCert.getCertificate(srvUrl.hostname, (err, keyContent, certContent) => {
        if (err) {
          return done(err);
        }
        const server = new https.Server({
          key: keyContent,
          cert: certContent,
          SNICallback: (hostname, next) => {
            easyCert.getCertificate(hostname, (err, sKey, sCert) => {
              next(null, tls.createSecureContext({
                key: sKey,
                cert: sCert
              }));
            });
          }
        });

        server.on('request', (req, res) => {
          done(null, req, res, srvSocket);
        });

        server.on('error', () => {
          if (srvSocket) {
            srvSocket.end();
          }
        });

        server.listen(0, () => {
          const address = server.address();
          srvSocket = net.connect(address.port, '127.0.0.1', () => {
            socket.write(`HTTP/${oreq.httpVersion} 200 OK\r\n\r\n`, 'UTF-8');
            srvSocket.write(head);
            srvSocket.pipe(socket);
            socket.pipe(srvSocket);
          });
          srvSocket.on('error', () => {
            srvSocket.end();
            server.end();
          });
        });
      });
    }
  },
  proxyToLocal(op, req, done) {
    let reqUrl = req.url;
    if (!/^http[s]?:/.test(reqUrl)) { // 适配 https
      reqUrl = `https://${req.headers.host}${req.url}`;
    }
    const iAddrs = Object.keys(op.localRemote || {});

    // 本地代理
    const remoteUrl = reqUrl.replace(/\?.*$/, '').replace(/#.*$/, '');
    let proxyUrl = '';
    let proxyIgnore = false;

    if (op.ignores && ~op.ignores.indexOf(remoteUrl)) {
      proxyIgnore = true;
    }

    if (!proxyIgnore) {
      iAddrs.map((addr) => {
        const localAddr = op.localRemote[addr];
        const iAddr = fn.hideProtocol(addr);
        const iReqUrl = fn.hideProtocol(reqUrl);

        if (!localAddr || !addr) {
          return true;
        }

        if (iAddr === iReqUrl.substr(0, iAddr.length)) {
          const subAddr = util.joinFormat(localAddr, iReqUrl.substr(iAddr.length));
          if (/^http(s)?:/.test(localAddr)) {
            proxyUrl = subAddr;
            return false;
          }
        }
      });
    }

    if (proxyIgnore || !proxyUrl) {
      done(null);
    } else { // 透传 or 转发
      const vOpts = url.parse(proxyUrl);
      vOpts.method = req.method;
      vOpts.headers = req.headers;
      const vRequest = http.request(vOpts, (vRes) => {
        if (/^404|405$/.test(vRes.statusCode)) {
          vRes.on('end', () => {
            done(null);
          });

          return vRequest.abort();
        } else {
          fn.log.u({
            src: reqUrl,
            dest: proxyUrl,
            status: 200
          });
          done(vRes);
        }
      });
      req.pipe(vRequest);
    }
  }
};

const cache = {
  server: null,
  crtMgr: null,
  index: 0
};

const wProxy = {
  init: function(op, done) {
    const iPort = op.port || 8887;

    // cert
    new util.Promise((next) => {
      if (easyCert.isRootCAFileExists()) {
        log('msg', 'success', ['cert  cert already exists']);
        log('msg', 'success', [`cert  ${chalk.yellow('please double click the rootCA.crt and trust it')}`]);
        log('msg', 'success', [`cert  ${chalk.yellow(util.vars.SERVER_CERTS_PATH)}`]);
        next();
      } else {
        log('end');
        easyCert.generateRootCA({
          commonName: 'yyl-cert',
          overwrite: false
        }, (err) => {
          if (err) {
            log('msg', 'warn', ['cert: generate error', err]);
          } else {
            log('msg', 'success', ['cert: generate success']);
          }
          next();
        });
      }
    // server
    }).then(() => {
      const server = http.createServer((req, res) => {
        fn.proxyToLocal(op, req, (vRes) => {
          if (!vRes) { // 透传
            const vOpts = url.parse(req.url);
            vOpts.method = req.method;
            vOpts.headers = req.headers;

            const vRequest = http.request(vOpts, (vvRes) => {
              res.writeHead(vvRes.statusCode, vvRes.headers);
              vvRes.pipe(res);
            });
            vRequest.on('error', () => {
              res.end();
            });

            req.pipe(vRequest);
          } else {
            res.writeHead(vRes.statusCode, vRes.headers);
            vRes.pipe(res);
          }
        });
      });

      log('msg', 'success', 'proxy server start');
      Object.keys(op.localRemote).forEach((key) => {
        log('msg', 'success', `proxy map: ${chalk.cyan(key)} => ${chalk.yellow(op.localRemote[key])}`);
      });
      log('msg', 'success', `proxy server port: ${chalk.yellow(iPort)}`);

      server.listen(iPort);

      // ws 监听, 转发
      server.on('connect', (oReq, socket, head) => {
        fn.createHttpsServer(op, oReq, socket, head, (err, req, res) => {
          fn.proxyToLocal(op, req, (vRes) => {
            if (!vRes) { // TODO 这部分有问题 wss, ws 代理不了
              const x = request({
                url: `https://${req.headers.host}${req.url}`,
                headers: req.headers,
                method: req.method
              });
              x.on('request', (xReq, xRes) => {
                if (xRes) {
                  fn.log.u({
                    src: xReq.url,
                    dest: 'remote',
                    status: xRes.statusCode
                  });
                }
              });

              req.pipe(x);
              x.pipe(res);
            } else {
              res.writeHead(vRes.statusCode, vRes.headers);
              vRes.pipe(res);
            }
          });
        });
      });

      server.on('error', (err) => {
        if (err.code == 'EADDRINUSE') {
          log('msg', 'error', `proxy server start fail: ${chalk.yellow(iPort)} is occupied, please check`);
        } else {
          log('msg', 'error', ['proxy server error', err]);
        }
      });

      cache.server = server;

      return done && done();
    }).start();
  },
  abort: function() {
    if (cache.server) {
      return new Promise((next) => {
        cache.server.close(() => {
          cache.server = null;
          return next();
        });
      });
    } else {
      return Promise.resolve(null);
    }
  }
};

module.exports = wProxy;


