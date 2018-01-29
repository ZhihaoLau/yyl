'use strict';
/*!
 * gulpfile.js for yym-FETeam
 *
 * @author: jackness Lau
 */


var gulp = require('gulp');
var gutil = require('gulp-util');
var fs = require('fs');
var path = require('path');
var querystring = require('querystring');
var util = require('yyl-util');

var sass = require('gulp-sass'); // sass compiler
var minifycss = require('gulp-minify-css'); // minify css files
var jshint = require('gulp-jshint'); // check js syntac
var uglify = require('gulp-uglify'); // uglify js files
var imagemin = require('gulp-imagemin'); // minify images
var rename = require('gulp-rename'); // rename the files
var replacePath = require('gulp-replace-path'); // replace the assets path
var inlinesource = require('gulp-inline-source'); // requirejs optimizer which can combine all modules into the main js file
var filter = require('gulp-filter'); // filter the specified file(s) in file stream
var gulpJade = require('gulp-jade');

var babel = require('gulp-babel');
var rollupBabel = require('rollup-plugin-babel');
var rollupCommonjs = require('rollup-plugin-commonjs');
var rollup = require('gulp-rollup-stream');
var rollupAlias = require('rollup-plugin-alias');

var plumber = require('gulp-plumber');
var runSequence = require('run-sequence').use(gulp);
var prettify = require('gulp-prettify');
var through = require('through2');
var watch = require('gulp-watch');

require('colors');

// gutil.log = gutil.noop;

util.msg.init({
  type: {
    supercall: {name: 'Supercal', color: 'magenta'},
    optimize: {name: 'Optimize', color: 'green'},
    update: {name: 'Updated', color: 'cyan'}
  }
});

var config = require('./config.js');
var localConfig = fs.existsSync('./config.mine.js')? require('./config.mine.js'): {};

config = util.extend(true, config, localConfig);



var fn = {
  matchFront: function(iPath, frontPath) {
    return iPath.substr(0, frontPath.length) === frontPath;
  },
  hideUrlTail: function(url) {
    return url
      .replace(/\?.*?$/g, '')
      .replace(/#.*?$/g, '');
  },
  blankPipe: function(fn) {
    return through.obj((file, enc, next) => {
      if (typeof fn == 'function') {
        fn();
      }
      next(null, file);
    });
  },
  relateDest: function(iPath) {
    return util.joinFormat(path.relative(gulp.env.vars.destRoot, iPath));
  },
  taskHelper: function(commands) {
    var dirs = [];
    var output;
    if (!config.alias) {
      for (var key in config) {
        if (config.hasOwnProperty(key)) {
          dirs.push(key);
        }
      }

      output = [
        '',
        '',
        '  Ustage:'.yellow,
        `  yyl ${  commands  } --name <Project>`,
        '',
        '  Project:'.yellow,
        (function() {
          var r = [];
          dirs.forEach((item) => {
            r.push(`  ${  item.gray}`);
          });
          return r.join('\n');
        }()),
        '',
        ''
      ];
    } else {
      output = [
        '',
        '',
        '  Ustage:'.yellow,
        `  yyl ${ commands } not work`,
        ''
      ];
    }
    console.log(output.join('\n'));
  },

  /**
     * task 执行前初始化函数
     */
  taskInit: function() {
    var commands = process.argv[2];
    var iConfig;

    if (gulp.env.remote) {
      gulp.env.ver = 'remote';
    }

    if (gulp.env.ver) {
      gulp.env.version = gulp.env.ver;
    }

    if (gulp.env.sub) {
      gulp.env.subname = gulp.env.sub;
    }
    if (gulp.env.name) {
      iConfig = config[gulp.env.name];
    } else {
      iConfig = config;
    }

    if (!iConfig || !iConfig.alias) {
      fn.taskHelper(commands);
      process.exit();
    } else {
      gulp.env.vars = iConfig.alias;
      gulp.env.remotePath = gulp.env.ver == 'remote' || gulp.env.isCommit? iConfig.commit.hostname: '/';
      return iConfig;
    }
  },
  supercall: function(cmd, done) {
    var iCmd = [
      `yyl supercall ${  cmd}`,
      util.envStringify({
        name: gulp.env.name,
        ver: gulp.env.ver,
        debug: gulp.env.debug,
        silent: gulp.env.silent,
        proxy: gulp.env.proxy,
        remotePath: gulp.env.remotePath
      })
    ].join(' ');

    util.msg.supercall(iCmd);
    util.runSpawn(iCmd, () => {
      return done && done();
    }, __dirname);
  },
  srcRelative:  function(files, op) {
    var iPaths;
    var iBase = op.base;
    if (util.type(files) != 'array') {
      iPaths = [files];
    } else {
      iPaths = files;
    }

    var isPage = function(iPath) {
      var pagePath = util.joinFormat(op.base, 'components/p-');
      var sameName = false;

      iPath.replace(/p-([a-zA-Z0-9-]+)\/p-([a-zA-Z0-9-]+)\.\w+$/, (str, $1, $2) => {
        sameName = $1 === $2;
        return str;
      });
      return sameName && pagePath == iPath.substr(0, pagePath.length);
    };
    var rMap = {
      source: {
        // 文件路径: [被引用的文件路径列表]
        // r-demo: [p-demo, r-demo2]
      },
      set: function(source, iPath) {
        if (!rMap.source[iPath]) {
          rMap.source[iPath] = [];
        }
        if (!~rMap.source[iPath].indexOf(source)) {
          rMap.source[iPath].push(source);
        }
      },
      findPages: function(iPath) {
        var cache = {};
        var findit = function(iPath) {
          var r = [];
          var rs = rMap.source[iPath];

          if (!rs || !rs.length) {
            return r;
          }

          rs = [].concat(rs);

          for (var i = 0; i < rs.length; ) {
            if (cache[rs[i]]) {
              rs.splice(i, 1);
            } else {
              cache[rs[i]] = true;
              i++;
            }
          }

          if (isPage(iPath)) {
            r.push(iPath);
          }

          rs.forEach((rPath) => {
            if (isPage(rPath)) {
              // console.log('findit('+ iPath +')','=== run 1', rPath);
              r.push(rPath);
            } else {
              // console.log('findit('+ iPath +')','=== run findit('+ rPath +')');
              r = r.concat(findit(rPath));
            }
            // 去重
            r = Array.from(new Set(r));
          });
          return r;
        };
        return findit(iPath);
      }

    };

    var friendship = {
      scss: function(iPath) {
        var sourceFiles = util.readFilesSync(iBase, /\.scss/);

        iPath = util.joinFormat(iPath);

        if (~sourceFiles.indexOf(iPath)) { //排除当前文件
          sourceFiles.splice(sourceFiles.indexOf(iPath), 1);
        }

        var r = [];

        if (isPage(iPath)) { // 如果自己是 p-xx 文件 也添加到 返回 array
          r.push(iPath);
        }

        // 生成文件引用关系表
        sourceFiles.forEach((iSource) => {
          var iCnt = fs.readFileSync(iSource).toString();

          iCnt.replace(/@import ["']([^'"]+)['"]/g, (str, $1) => {
            var myPath = util.joinFormat(path.dirname(iSource), $1 + (path.extname($1)?'': '.scss'));
            rMap.set(iSource, myPath);
            return str;
          });
        });

        // 查找调用情况
        r = r.concat(rMap.findPages(iPath));

        return r;
      },
      jade: function(iPath) {
        var sourceFiles = util.readFilesSync(iBase, /\.jade$/);
        iPath = util.joinFormat(iPath);

        if (~sourceFiles.indexOf(iPath)) { // 排除当前文件
          sourceFiles.splice(sourceFiles.indexOf(iPath), 1);
        }

        var r = [];

        if (/p-[a-zA-Z0-9-]+\/p-[a-zA-Z0-9-]+\.jade$/.test(iPath)) { // 如果自己是 p-xx 文件 也添加到 返回 array
          r.push(iPath);
        }

        // 查找 文件当中 有引用当前 地址的, 此处应有递归
        sourceFiles.forEach((iSource) => {
          var iCnt = fs.readFileSync(iSource).toString();
          iCnt.replace(/(extends|include) ([^ \r\n\t]+)/g, (str, $1, $2) => {
            var myPath = util.joinFormat(path.dirname(iSource), `${$2  }.jade`);
            rMap.set(iSource, myPath);
            return str;
          });
        });

        // 查找调用情况
        r = r.concat(rMap.findPages(iPath));

        return r;
      },
      js: function(iPath) {
        var sourceFiles = util.readFilesSync(iBase, /\.js/);
        iPath = util.joinFormat(iPath);

        if (~sourceFiles.indexOf(iPath)) { // 排除当前文件
          sourceFiles.splice(sourceFiles.indexOf(iPath), 1);
        }

        var r = [];

        if (isPage(iPath)) { // 如果自己是 p-xx 文件 也添加到 返回 array
          r.push(iPath);
        }
        // 如果是 lib 里面的 js 也返回到当前 array
        if (op.jslib && op.jslib == iPath.substring(0, op.jslib.length)) {
          r.push(iPath);
        }

        var
          var2Path = function(name, dirname) {
            var rPath = op.alias[name];
            if (rPath) {
              return util.joinFormat(rPath + (path.extname(rPath)? '': '.js'));
            } else {
              rPath = name;
              return util.joinFormat(dirname, rPath + (path.extname(rPath)? '': '.js'));
            }
          };

        // 查找 文件当中 有引用当前 地址的
        sourceFiles.forEach((iSource) => {
          var iCnt = fs.readFileSync(iSource).toString();
          iCnt.replace(/\r|\t/g, '')
            .replace(/require\s*\(\s*["']([^'"]+)['"]/g, (str, $1) => { // require('xxx') 模式
              var myPath = var2Path($1, path.dirname(iSource));
              rMap.set(iSource, myPath);

              return str;
            }).replace(/require\s*\(\s*(\[[^\]]+\])/g, (str, $1) => { // require(['xxx', 'xxx']) 模式
              var iMatchs = [];
              try {
                iMatchs = new Function(`return ${  $1}`)();
              } catch (er) {}

              iMatchs.forEach((name) => {
                var myPath = var2Path(name, path.dirname(iSource));
                rMap.set(iSource, myPath);
              });

              return str;
            }).replace(/define\s*\(\s*(\[[^\]]+\])/g, (str, $1) => { // define(['xxx', 'xxx']) 模式
              var iMatchs = [];
              try {
                iMatchs = new Function(`return ${  $1}`)();
              } catch (er) {}

              iMatchs.forEach((name) => {
                var myPath = var2Path(name, path.dirname(iSource));
                rMap.set(iSource, myPath);
              });

              return str;
            }).replace(/import[^'"]+['"]([^'"]+)["']/g, (str, $1) => { // import xx from 'xx' 模式
              var myPath = var2Path($1, path.dirname(iSource));
              rMap.set(iSource, myPath);
              return str;
            });
        });

        // 查找调用情况
        r = r.concat(rMap.findPages(iPath));

        return r;
      },
      other: function(iPath) { // 检查 html, css 当中 是否有引用
        return [iPath];
      }

    };

    var r = [];


    iPaths.forEach((iPath) => {
      var iExt = path.extname(iPath).replace(/^\./, '');
      var handle;
      switch (iExt) {
        case 'scss':
          handle = friendship.scss;
          break;

        case 'jade':
          handle = friendship.jade;
          break;

        case 'js':
          handle = friendship.js;
          break;

        default:
          handle = friendship.other;
          break;
      }

      r = r.concat(handle(iPath));
    });
    return r;
  },
  // 从 dest 中生成的文件查找调用该文件的 css, html, 返回 这 css html 对应的 src 源文件
  destRelative: function(files, op) {
    var iFiles = util.type(iFiles) == 'array'? files: [files];
    var r = [];
    var destFiles = [];
    var revMap = {};
    var hostRoot = util.joinFormat(
      op.remotePath,
      path.relative(op.destRoot, op.revRoot)
    );
    // 根据地址 返回 输出目录内带有 remote 和 hash 的完整地址
    var getRevMapDest = function(iPath) {
      var revSrc = util.joinFormat(path.relative(op.revRoot, iPath));
      return util.joinFormat(hostRoot, revMap[revSrc] || revSrc);
    };
    // 根据地址返回 rev map 中的 源文件
    var getRevSrcPath = function(iPath) {
      var revDest = util.joinFormat(path.relative(op.revRoot, iPath));

      for (var key in revMap) {
        if (revMap.hasOwnProperty(key)) {
          if (revMap[key] == revDest) {
            return util.joinFormat(op.revRoot, key);
          }
        }
      }

      return iPath;
    };


    if (op.revPath && fs.existsSync(op.revPath)) {
      try {
        revMap = JSON.parse(fs.readFileSync(op.revPath).toString());
      } catch (er) {}
    }


    iFiles.forEach((iPath) => {
      var iExt = path.extname(iPath).replace(/^\./, '');
      var searchFiles = [];

      switch (iExt) {
        case 'html': // html 没有谁会调用 html 的
          break;
        case 'js':
        case 'css': // 查找调用这文件的 html
          searchFiles = util.readFilesSync(op.root, /\.html$/);
          break;
        default:
          if (fn.isImage(iPath)) { // 查找调用这文件的 html, css
            searchFiles = util.readFilesSync(op.root, /\.(html|css)$/);
          }
          break;
      }

      searchFiles.forEach((iSearch) => {
        var iCnt = fs.readFileSync(iSearch).toString();
        var iSrc;
        if (iCnt.split(getRevMapDest(iPath)).length > 1) { // match
          iSrc = getRevSrcPath(iSearch);

          if (!~destFiles.indexOf(iSrc)) {
            destFiles.push(iSrc);
          }
        }
      });
    });

    // 根据生成的 html, css 反推出对应src 的哪个文件
    destFiles.forEach((iPath) => {
      var filename = path.basename(iPath).replace(/\.[^.]+$/, '');
      var rPaths = [];
      if (op.htmlDest == iPath.substr(0, op.htmlDest.length) && path.extname(iPath) == '.html') { // html
        rPaths.push(util.joinFormat(op.srcRoot, 'html', path.basename(iPath)));
        rPaths.push(util.joinFormat(op.srcRoot, 'components', `p-${  filename}`, `p-${  filename  }.jade`));
      } else if (op.cssDest == iPath.substr(0, op.cssDest.length) && path.extname(iPath) == '.css') { // css
        rPaths.push(util.joinFormat(op.srcRoot, 'css', path.basename(iPath)));
        rPaths.push(util.joinFormat(op.srcRoot, 'sass', `${filename  }scss`));
        rPaths.push(util.joinFormat(op.srcRoot, 'components', `p-${  filename}`, `p-${  filename  }.scss`));
      }

      rPaths.forEach((rPath) => {
        if (fs.existsSync(rPath)) {
          r.push(rPath);
        }
      });
    });

    return r;
  },
  pathInside: function(relPath, targetPath) {
    return !/^\.\.\//.test(util.joinFormat(path.relative(relPath, targetPath)));
  },
  isImage: function(iPath) {
    return /^\.(jpg|jpeg|bmp|gif|webp|png|apng)$/.test(path.extname(iPath));
  }
};

var REG = {
  HTML_PATH_REG: /(src|href|data-main|data-original)(\s*=\s*)(['"])([^'"]*)(["'])/ig,
  HTML_SCRIPT_REG: /(<script[^>]*>)([\w\W]*?)(<\/script>)/ig,
  HTML_IGNORE_REG: /^(about:|data:|javascript:|#|\{\{)/,
  HTML_SCRIPT_TEMPLATE_REG: /type\s*=\s*['"]text\/html["']/,
  HTML_ALIAS_REG: /^(\{\$)(\w+)(\})/g,

  HTML_STYLE_REG: /(<style[^>]*>)([\w\W]*?)(<\/style>)/ig,
  HTML_SRC_COMPONENT_JS_REG: /^\.\.\/components\/p-[a-zA-Z0-9-]+\/p-([a-zA-Z0-9-]+).js/g,

  HTML_SRC_COMPONENT_IMG_REG: /^\.\.\/(components\/[pwr]-[a-zA-Z0-9-]+\/images)/g,

  CSS_PATH_REG: /(url\s*\(['"]?)([^'"]*?)(['"]?\s*\))/ig,
  CSS_PATH_REG2: /(src\s*=\s*['"])([^'" ]*?)(['"])/ig,
  CSS_IGNORE_REG: /^(about:|data:|javascript:|#|\{\{)/,

  IS_HTTP: /^(http[s]?:)|(\/\/\w)/
};

var
  iStream = {
    // + html task
    jade2html: function(stream) {
      var iConfig = fn.taskInit();
      var vars = gulp.env.vars;

      if (!iConfig) {
        return;
      }
      var rStream = stream
        .pipe(plumber())
        .pipe(through.obj(function(file, enc, next) {
          util.msg.optimize('jade', file.relative);
          this.push(file);
          next();
        }))
        .pipe(gulpJade({
          pretty: false,
          client: false
        }))
        .pipe(through.obj(function(file, enc, next) {
          var iCnt = file.contents.toString();
          var dirname = util.joinFormat( vars.srcRoot, 'html');

          iCnt = iCnt
            // 隔离 script 内容
            .replace(REG.HTML_SCRIPT_REG, (str, $1, $2, $3) => {
              if ($1.match(REG.HTML_SCRIPT_TEMPLATE_REG)) {
                return str;
              } else {
                return $1 + querystring.escape($2) + $3;
              }
            })
            // 隔离 style 标签
            .replace(REG.HTML_STYLE_REG, (str, $1, $2, $3) => {
              return $1 + querystring.escape($2) + $3;
            })
            .replace(REG.HTML_PATH_REG, (str, $1, $2, $3, $4, $5) => {
              var iPath = $4;
              var rPath = '';

              iPath = iPath.replace(REG.HTML_ALIAS_REG, (str, $1, $2) => {
                if (vars[$2]) {
                  return path.relative( path.dirname(file.path), vars[$2]);
                } else {
                  return str;
                }
              });

              if (iPath.match(REG.HTML_IGNORE_REG) || iPath.match(REG.IS_HTTP) || !iPath) {
                return str;
              }

              if (path.extname(iPath) == '.scss') { // 纠正 p-xx.scss 路径
                var filename = path.basename(iPath, path.extname(iPath));
                if (/^p-/.test(filename)) {
                  iPath = util.joinFormat(path.relative(
                    path.dirname(file.path),
                    path.join(vars.srcRoot, 'css', `${filename.replace(/^p-/, '')  }.css`))
                  );
                }
              }

              rPath = util.path.join(
                path.relative(dirname, path.dirname(file.path)),
                iPath
              ).replace(/\\+/g, '/').replace(/\/+/, '/');

              return `${$1}${$2}${$3}${rPath}${$5}`;
            })
            // 取消隔离 script 内容
            .replace(REG.HTML_SCRIPT_REG, (str, $1, $2, $3) => {
              if ($1.match(REG.HTML_SCRIPT_TEMPLATE_REG)) {
                return str;
              } else {
                return $1 + querystring.unescape($2) + $3;
              }
            })
            // 取消隔离 style 标签
            .replace(REG.HTML_STYLE_REG, (str, $1, $2, $3) => {
              return $1 + querystring.unescape($2) + $3;
            });

          file.contents = Buffer.from(iCnt, 'utf-8');
          this.push(file);
          next();
        }))
        .pipe(rename((path) => {
          path.basename = path.basename.replace(/^p-/g, '');
          path.dirname = '';
        }))
        .pipe(prettify({indent_size: 4}));
      // .pipe(gulp.dest(util.joinFormat(vars.srcRoot, 'html')))

      return rStream;
    },
    html2dest: function(stream) {
      var
        iConfig = fn.taskInit();

      if (!iConfig) {
        return;
      }

      var vars = gulp.env.vars;
      var relateHtml = function(iPath) {
        return util.joinFormat(
          path.relative(
            path.join(gulp.env.vars.srcRoot, 'html'),
            iPath
          )
        );
      };
      var relateDirname = function(iPath) {
        return util.joinFormat(
          path.relative(
            path.join(gulp.env.vars.dirname),
            iPath
          )
        );
      };
      var remotePath = gulp.env.remotePath;


      // html task
      var rStream = stream
        .pipe(plumber())
        .pipe(inlinesource())

        // 将用到的 commons 目录下的 images 资源引入到项目里面
        .pipe(through.obj(function(file, enc, next) {
          var iCnt = file.contents.toString();
          var gComponentPath = relateHtml(vars.globalcomponents);
          var copyPath = {};


          var filterHandle = function(str, $1, $2, $3, $4) {
            var iPath = $4;

            if (iPath.match(REG.HTML_IGNORE_REG) || iPath.match(REG.IS_HTTP)) {
              return str;
            }


            if (iPath.substr(0, gComponentPath.length) != gComponentPath) {
              return str;
            }

            var dirname = iPath.substr(gComponentPath.length);

            copyPath[util.joinFormat(vars.srcRoot, 'html', iPath)] = util.joinFormat(vars.imagesDest, 'globalcomponents', dirname);

            return str;
          };

          iCnt.replace(REG.HTML_PATH_REG, filterHandle);

          this.push(file);

          // 复制
          if (Object.keys(copyPath).length) {
            util.msg.info('copy file start', copyPath);
            util.copyFiles(copyPath, () => {
              util.msg.success('copy file done');
              next();
            });
          } else {
            next();
          }
        }))
        .pipe(through.obj(function(file, enc, next) {
          var iCnt = file.contents.toString();

          iCnt = iCnt
            // 隔离 script 内容
            .replace(REG.HTML_SCRIPT_REG, (str, $1, $2, $3) => {
              if ($1.match(REG.HTML_SCRIPT_TEMPLATE_REG)) {
                return str;
              } else {
                return $1 + querystring.escape($2) + $3;
              }
            })
            // 隔离 style 标签
            .replace(REG.HTML_STYLE_REG, (str, $1, $2, $3) => {
              return $1 + querystring.escape($2) + $3;
            })
            .replace(REG.HTML_PATH_REG, (str, $1, $2, $3, $4, $5) => {
              var iPath = $4;
              var rPath = '';

              if (iPath.match(REG.HTML_IGNORE_REG) || iPath.match(REG.IS_HTTP) || !iPath) {
                return str;
              }

              rPath = iPath;

              // 替换指向 dest 目录的路径
              if (fn.matchFront(rPath, `${relateHtml(vars.destRoot)}/`)) {
                rPath = rPath
                  .split(`${relateHtml(vars.destRoot)}/`)
                  .join(util.joinFormat(remotePath));
              }

              // 替换全局 图片
              if (fn.matchFront(rPath, relateHtml(vars.globalcomponents))) {
                rPath = rPath
                  .split(relateHtml(vars.globalcomponents))
                  .join(util.joinFormat(remotePath, fn.relateDest(vars.imagesDest), 'globalcomponents'));
              }

              // 替换 common 下 lib
              if (fn.matchFront(rPath, relateHtml(vars.globallib))) {
                rPath = rPath
                  .split(relateHtml(vars.globallib))
                  .join(util.joinFormat(remotePath, fn.relateDest(vars.jslibDest), 'globallib'));
              }

              // 替换 jslib
              if (fn.matchFront(rPath, '../js/lib')) {
                rPath = rPath
                  .split('../js/lib')
                  .join(util.joinFormat(remotePath, fn.relateDest(vars.jslibDest)));
              }

              // 替换 js
              if (fn.matchFront(rPath, '../js')) {
                rPath = rPath
                  .split('../js')
                  .join(util.joinFormat(remotePath, fn.relateDest(vars.jsDest)));
              }

              // 替换 components 中的js
              rPath = rPath.replace(REG.HTML_SRC_COMPONENT_JS_REG, util.joinFormat( remotePath, fn.relateDest(vars.jsDest), '/$1.js'));

              // 替换 css
              if (fn.matchFront(rPath, '../css')) {
                rPath = rPath
                  .split('../css')
                  .join(util.joinFormat( remotePath, fn.relateDest(vars.cssDest)));
              }

              // 替换公用图片
              if (fn.matchFront(rPath, '../images')) {
                rPath = rPath
                  .split('../images')
                  .join(util.joinFormat( remotePath, fn.relateDest(vars.imagesDest)));
              }

              rPath = rPath.replace(REG.HTML_SRC_COMPONENT_IMG_REG, util.joinFormat( remotePath, fn.relateDest(vars.imagesDest), '$1'));

              // 替换 config.resource 里面的路径
              var resource = iConfig.resource;
              if (resource) {
                Object.keys(resource).forEach((key) => {
                  if (fn.matchFront(rPath, relateHtml(key))) {
                    rPath = rPath
                      .split(relateHtml(key))
                      .join(util.joinFormat(remotePath, fn.relateDest(resource[key])));
                  }
                });
              }



              return `${$1}${$2}${$3}${rPath}${$5}`;
            })
            // 取消隔离 script 内容
            .replace(REG.HTML_SCRIPT_REG, (str, $1, $2, $3) => {
              if ($1.match(REG.HTML_SCRIPT_TEMPLATE_REG)) {
                return str;
              } else {
                return $1 + querystring.unescape($2) + $3;
              }
            })
            // 取消隔离 style 标签
            .replace(REG.HTML_STYLE_REG, (str, $1, $2, $3) => {
              return $1 + querystring.unescape($2) + $3;
            });

          file.contents = Buffer.from(iCnt, 'utf-8');
          this.push(file);
          next();
        }))
        // 把用到的 commons 目录下的 js 引入到 项目的 lib 底下
        .pipe(through.obj(function(file, enc, next) {
          file.contents.toString()
            .replace(new RegExp(`['"]${ util.joinFormat(remotePath, fn.relateDest(vars.jslibDest), 'globallib') }([^'"]*)["']`, 'g'), (str, $1) => {
              var sourcePath = util.joinFormat(vars.globallib, $1);
              var toPath = util.joinFormat(vars.jslibDest, 'globallib', $1);
              util.copyFiles(
                sourcePath,
                toPath,
                (err) => {
                  if (!err) {
                    util.msg.create(relateDirname(toPath));
                  }
                }
              );
              return str;
            });

          this.push(file);
          next();
        }));
      // .pipe(gulp.dest(vars.htmlDest));

      return rStream;
    },
    jade2dest: function(stream) {
      var
        rStream = iStream.jade2html(stream);

      rStream = iStream.html2dest(rStream);
      return rStream;
    },
    // - html task
    // + css task
    sassBase2css: function(stream) {
      var
        rStream = stream
          .pipe(plumber())
          .pipe(sass({outputStyle: 'nested'}).on('error', sass.logError));
      return rStream;
    },
    sassComponent2css: function(stream) {
      var iConfig = fn.taskInit();
      if (!iConfig) {
        return;
      }
      var vars = gulp.env.vars;

      var
        rStream = stream
          .pipe(through.obj(function(file, enc, next) {
            util.msg.optimize('sass', file.relative);
            this.push(file);
            next();
          }))
          .pipe(sass({outputStyle: 'nested'}).on('error', sass.logError))
          .pipe(through.obj(function(file, enc, next) {
            var iCnt = file.contents.toString();
            var dirname = util.joinFormat(vars.srcRoot, 'css');

            var replaceHandle = function(str, $1, $2, $3) {
              var iPath = $2;
              var rPath = '';

              if (iPath.match(REG.CSS_IGNORE_REG)) {
                return str;
              }

              if (iPath.match(REG.IS_HTTP)) {
                return str;
              }


              var fDirname = path.dirname(path.relative(dirname, file.path));
              rPath = util.path.join(fDirname, iPath);

              var rPath2 = util.path.join(dirname, iPath);

              if (fs.existsSync(fn.hideUrlTail(util.path.join(dirname, rPath)))) { // 以当前文件所在目录为 根目录查找文件
                return $1 + rPath + $3;
              } else if (fs.existsSync(fn.hideUrlTail(rPath2))) { // 如果直接是根据生成的 css 目录去匹配 也允许
                return str;
              } else {
                util.msg.warn('css url replace error', path.basename(file.history.toString()));
                util.msg.warn('    path not found', util.joinFormat(dirname, rPath));
                return str;
              }
            };


            iCnt = iCnt
              .replace(REG.CSS_PATH_REG, replaceHandle)
              .replace(REG.CSS_PATH_REG2, replaceHandle);

            file.contents = Buffer.from(iCnt, 'utf-8');
            this.push(file);
            next();
          }))
          .pipe(rename((path) => {
            path.dirname = '';
            path.basename = path.basename.replace(/^p-/, '');
          }));
      // .pipe(gulp.dest(util.joinFormat(vars.srcRoot, 'css')));
      return rStream;
    },
    css2dest: function(stream) {
      var iConfig = fn.taskInit();
      if (!iConfig) {
        return;
      }

      var vars = gulp.env.vars;
      var remotePath = gulp.env.remotePath;
      var relateCss = function(iPath) {
        return util.joinFormat(
          path.relative(
            path.join(vars.srcRoot, 'css'),
            iPath
          )
        );
      };

      var
        rStream = stream
          .pipe(plumber())
          // 将commons components 目录下的 图片 引入到 globalcomponents 里面
          .pipe(through.obj(function(file, enc, next) {
            var iCnt = file.contents.toString();
            var gComponentPath = relateCss(vars.globalcomponents);
            var copyPath = {};

            var filterHandle = function(str, $1, $2) {
              var iPath = $2;

              if (iPath.match(/^(about:|data:)/)) {
                return str;
              }



              if (iPath.substr(0, gComponentPath.length) != gComponentPath) {
                return str;
              }

              iPath = iPath.replace(/\?.*?$/g, '');

              var dirname = iPath.substr(gComponentPath.length);
              copyPath[util.joinFormat(vars.srcRoot, 'css', iPath)] = util.joinFormat(vars.imagesDest, 'globalcomponents', dirname);

              return str;
            };


            iCnt
              .replace(REG.CSS_PATH_REG, filterHandle)
              .replace(REG.CSS_PATH_REG2, filterHandle);

            this.push(file);

            // 复制
            if (Object.keys(copyPath).length) {
              util.copyFiles(copyPath, () => {
                util.msg.success('copy file done');
                next();
              }, null, null, vars.dirname);
            } else {
              next();
            }
          }))
          .pipe(through.obj(function(file, enc, next) {
            var iCnt = file.contents.toString();
            var filterHandle = function(str, $1, $2, $3) {
              var iPath = $2;

              if (iPath.match(REG.CSS_IGNORE_REG) || iPath.match(REG.IS_HTTP) || !iPath) {
                return str;
              }

              var rPath = iPath;

              // 替换 commons components 里面的 图片
              if (fn.matchFront(rPath, relateCss(vars.globalcomponents))) {
                rPath = rPath
                  .split(relateCss(vars.globalcomponents))
                  .join(util.joinFormat(remotePath, fn.relateDest(path.join(vars.imagesDest, 'globalcomponents'))));
              }

              // 替换图片
              if (fn.matchFront(rPath, '../images')) {
                rPath = rPath
                  .split('../images')
                  .join(util.joinFormat(remotePath, fn.relateDest(vars.imagesDest)));
              }

              // 替换 components 内图片
              if (fn.matchFront(rPath, '../components')) {
                rPath = rPath
                  .split('../components')
                  .join(util.joinFormat( remotePath, fn.relateDest( path.join(vars.imagesDest, 'components'))));
              }

              // 替换 config.resource 里面的路径
              var resource = iConfig.resource;
              if (resource) {
                Object.keys(resource).forEach((key) => {
                  if (fn.matchFront(rPath, relateCss(key))) {
                    rPath = rPath
                      .split(relateCss(key))
                      .join(util.joinFormat(remotePath, fn.relateDest(resource[key])));
                  }
                });
              }

              return `${$1}${rPath}${$3}`;
            };

            iCnt = iCnt
              .replace(REG.CSS_PATH_REG, filterHandle)
              .replace(REG.CSS_PATH_REG2, filterHandle);

            file.contents = Buffer.from(iCnt, 'utf-8');
            this.push(file);
            next();
          }))
          .pipe(gulp.env.isCommit?minifycss({
            compatibility: 'ie7'
          }): fn.blankPipe());
      return rStream;
    },
    sassComponent2dest: function(stream) {
      var rStream;
      rStream = iStream.sassComponent2css(stream);
      rStream = iStream.css2dest(rStream);

      return rStream;
    },
    sassBase2dest: function(stream) {
      var rStream;
      rStream = iStream.sassBase2css(stream);
      rStream = iStream.css2dest(rStream);

      return rStream;
    },
    // - css task
    // + image task
    image2dest: function(stream) {
      var
        rStream = stream
          .pipe(plumber())
          .pipe(filter(['**/*.jpg', '**/*.jpeg', '**/*.png', '**/*.bmp', '**/*.gif', '**/*.webp']))
          .pipe(through.obj(function(file, enc, next) {
            util.msg.optimize('img ', file.relative);
            this.push(file);
            next();
          }))
          .pipe(
            gulp.env.isCommit?
              imagemin({ optimizationLevel: 3, progressive: true, interlaced: true }):
              fn.blankPipe()
          );

      return rStream;
    },
    // - image task
    // + js task
    rollup2dest: function(stream) {
      var iConfig = fn.taskInit();
      if (!iConfig) {
        return;
      }

      // 更新 alias

      var rStream = stream
        .pipe(filter('**/*.js'))
        .pipe(plumber())
        .pipe(jshint.reporter('default'))
        .pipe(jshint())
        .pipe(through.obj(function(file, enc, next) {
          util.msg.optimize('js  ', file.relative);
          this.push(file);
          next();
        }))
        .pipe(rollup({
          plugins: [
            rollupCommonjs(),
            rollupBabel(),
            rollupAlias(iConfig.alias)
          ],
          format: 'umd'
        }))
        .pipe(babel({
          presets: ['babel-preset-es2015'].map(require.resolve)
        }))
        .pipe(gulp.env.isCommit?uglify(): fn.blankPipe())
        .pipe(rename((path) => {
          path.basename = path.basename.replace(/^[pj]-/g, '');
          path.dirname = '';
        }));
      return rStream;
    },
    js2dest: function(stream) {
      var
        rStream = stream
          .pipe(plumber())
          .pipe(gulp.env.isCommit?uglify():fn.blankPipe());

      return rStream;
    },
    // - js task
    // + dest task
    // 从 dest 生成的一个文件找到关联的其他 src 文件， 然后再重新生成到 dest
    dest2dest: function(stream, op) {
      var rStream;
      rStream = stream.pipe(through.obj((file, enc, next) => {
        var relativeFiles = fn.destRelative(util.joinFormat(file.base, file.relative), op);
        var total = relativeFiles.length;
        var streamCheck = function() {
          if (total === 0) {
            next(null, file);
          }
        };

        relativeFiles.forEach((iPath) => {
          var rStream = iStream.any2dest(iPath);

          rStream.on('finish', () => {
            total--;
            streamCheck();
          });
        });
        streamCheck();
      }));
      return rStream;
    },
    // 任意src 内文件输出到 dest (遵循 构建逻辑)
    any2dest: function(iPath) {
      var vars = gulp.env.vars;
      var iExt = path.extname(iPath).replace(/^\./, '');
      var inside = function(rPath) {
        return fn.pathInside(util.joinFormat(vars.srcRoot, rPath), iPath);
      };
      var rStream;

      switch (iExt) {
        case 'jade':
          if (inside('components')) { // jade-to-dest-task
            rStream = iStream.jade2dest(gulp.src([iPath], {
              base: util.joinFormat(vars.srcRoot)
            }));
            rStream = rStream.pipe(gulp.dest(vars.htmlDest));
          }

          break;
        case 'html':
          if (inside('html')) { // html-to-dest-task
            rStream = iStream.html2dest(gulp.src([iPath], {
              base: util.joinFormat(vars.srcRoot, 'html')
            }));
            rStream = rStream.pipe(gulp.dest(vars.htmlDest));
          }
          break;

        case 'scss':
          if (inside('components')) { // sass-component-to-dest
            rStream = iStream.sassComponent2dest(gulp.src([iPath], {
              base: path.join(vars.srcRoot)
            }));
            rStream = rStream.pipe(gulp.dest(util.joinFormat(vars.cssDest)));
          } else if (inside('sass') && !inside('sass/base')) { // sass-base-to-dest
            rStream = iStream.sassBase2dest(gulp.src([iPath], {
              base: path.join(vars.srcRoot)
            }));

            rStream = rStream.pipe(gulp.dest( util.joinFormat(vars.cssDest)));
          }
          break;
        case 'css':
          if (inside('css')) { // css-to-dest
            rStream = iStream.css2dest(gulp.src([iPath], {
              base: util.joinFormat(vars.srcRoot, 'css')
            }));
            rStream = rStream.pipe(gulp.dest( util.joinFormat(vars.cssDest)));
          }
          break;

        case 'js':
          if (!inside('js/lib') && !inside('js/rConfig') && !inside('js/widget')) { // requirejs-task
            rStream = iStream.rollup2dest(gulp.src([iPath], {
              base: vars.srcRoot
            }));
            rStream = rStream.pipe(gulp.dest(util.joinFormat(vars.jsDest)));
          } else if (inside('js/lib')) { // jslib-task
            rStream = iStream.js2dest(gulp.src([iPath], {
              base: util.joinFormat(vars.srcRoot, 'js/lib')
            }));
            rStream = rStream.pipe(gulp.dest(vars.jslibDest));
          }
          break;

        case 'json':
          if (inside('js')) { // data-task
            rStream = gulp.src([iPath], {
              base : util.joinFormat(vars.srcRoot, 'js')
            });

            rStream = rStream.pipe(gulp.dest( vars.jsDest ));
          }
          break;

        default:
          if (fn.isImage(iPath)) {
            if (inside('components')) { // images-component-task
              rStream = iStream.image2dest(gulp.src([iPath], {
                base: util.joinFormat( vars.srcRoot, 'components')
              }));

              rStream = rStream.pipe(gulp.dest( util.joinFormat( vars.imagesDest, 'components')));
            } else if (inside('images')) { // images-base-task
              rStream = iStream.image2dest(gulp.src([iPath], {
                base: util.joinFormat( vars.srcRoot, 'images')
              }));
              rStream = rStream.pipe(gulp.dest( util.joinFormat(vars.imagesDest)));
            }
          }
          break;

      }

      return rStream;
    }
    // - dest task
  };


// + html task
gulp.task('html', ['jade-to-dest-task', 'html-to-dest-task'], () => {
});

gulp.task('jade-to-dest-task', () => {
  var iConfig = fn.taskInit();
  var vars = gulp.env.vars;

  if (!iConfig) {
    return;
  }
  var rStream;

  rStream = iStream.jade2dest(gulp.src(util.joinFormat(vars.srcRoot, 'components/@(p-)*/*.jade')));
  rStream = rStream.pipe(gulp.dest(vars.htmlDest));

  return rStream;
});

gulp.task('html-to-dest-task', () => {
  var iConfig = fn.taskInit();
  var vars = gulp.env.vars;

  if (!iConfig) {
    return;
  }
  var rStream;

  rStream = iStream.html2dest(gulp.src(util.joinFormat(vars.srcRoot, 'html/*.html')));
  rStream = rStream.pipe(gulp.dest(vars.htmlDest));

  return rStream;
});
// - html task

// + css task
gulp.task('css', ['sass-component-to-dest', 'sass-base-to-dest', 'css-to-dest'], (done) => {
  runSequence('concat-css', done);
});
gulp.task('sass-component-to-dest', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }

  var vars = gulp.env.vars;
  var rStream;

  rStream = iStream.sassComponent2dest(
    gulp.src(path.join(vars.srcRoot, 'components/@(p-)*/*.scss'), {
      base: path.join(vars.srcRoot)
    })
  );

  rStream = rStream.pipe(gulp.dest( util.joinFormat(vars.cssDest)));

  return rStream;
});

gulp.task('sass-base-to-dest', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }

  var vars = gulp.env.vars;

  var rStream;

  rStream = iStream.sassBase2dest(gulp.src([
    util.joinFormat(vars.srcRoot, 'sass/**/*.scss'),
    `!${  util.joinFormat(vars.srcRoot, 'sass/base/**/*.*')}`
  ]));

  rStream = rStream.pipe(gulp.dest( util.joinFormat(vars.cssDest)));

  return rStream;
});

gulp.task('css-to-dest', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }

  var vars = gulp.env.vars;

  var rStream;

  rStream = iStream.css2dest(gulp.src(path.join(vars.srcRoot, 'css', '**/*.css')));
  rStream = rStream.pipe(gulp.dest( util.joinFormat(vars.cssDest)));

  return rStream;
});
// - css task

// + images task
gulp.task('images', ['images-base-task', 'images-component-task'], () => {
});

gulp.task('images-base-task', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }
  var vars = gulp.env.vars;
  var rStream;

  rStream = iStream.image2dest(gulp.src([ util.joinFormat( vars.srcRoot, 'images/**/*.*')], {base: util.joinFormat( vars.srcRoot, 'images')}));
  rStream = rStream.pipe(gulp.dest( util.joinFormat(vars.imagesDest)));

  return rStream;
});
gulp.task('images-component-task', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }

  var
    vars = gulp.env.vars;

  var rStream;

  rStream = iStream.image2dest(gulp.src([util.joinFormat( vars.srcRoot, 'components/**/*.*')], {
    base: util.joinFormat( vars.srcRoot, 'components')
  }));

  rStream = rStream.pipe(gulp.dest( util.joinFormat( vars.imagesDest, 'components')));

  return rStream;
});
// - images task

// + js task
gulp.task('js', ['rollup-task', 'jslib-task', 'data-task'], (done) => {
  runSequence('concat-js', done);
});

gulp.task('rollup-task', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }
  var vars = gulp.env.vars;

  var rStream;

  rStream = iStream.rollup2dest(gulp.src([
    util.joinFormat(vars.srcRoot, 'components/p-*/p-*.js'),
    util.joinFormat(vars.srcRoot, 'js/**/*.js'),
    `!${  util.joinFormat(vars.srcRoot, 'js/lib/**')}`,
    `!${  util.joinFormat(vars.srcRoot, 'js/rConfig/**')}`,
    `!${  util.joinFormat(vars.srcRoot, 'js/widget/**')}`
  ], {
    base: vars.srcRoot
  }));

  rStream = rStream.pipe(gulp.dest(util.joinFormat(vars.jsDest)));

  return rStream;
});

gulp.task('jslib-task', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }
  var vars = gulp.env.vars;

  var rStream;

  rStream = iStream.js2dest(gulp.src(util.joinFormat( vars.srcRoot, 'js/lib/**/*.js')));
  rStream = rStream.pipe(gulp.dest(vars.jslibDest));

  return rStream;
});

gulp.task('data-task', () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }
  var vars = gulp.env.vars;

  return gulp.src([util.joinFormat(vars.srcRoot, 'js/**/*.json')])
    .pipe(gulp.dest( vars.jsDest ));
});

// - js task

// + concat task
gulp.task('concat', (done) => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return done();
  }
  if (!iConfig.concat) {
    return done();
  }

  fn.supercall('concat', done);
});
gulp.task('concat-js', (done) => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return done();
  }
  if (!iConfig.concat) {
    return done();
  }

  fn.supercall('concat-js', done);
});
gulp.task('concat-css', (done) => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return done();
  }
  if (!iConfig.concat) {
    return done();
  }

  fn.supercall('concat-css', done);
});
// - concat task

// + resource
gulp.task('resource', (done) => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return done();
  }

  if (!iConfig.resource) {
    return done();
  }
  fn.supercall('resource', done);
});
// - resource


// + rev
gulp.task('rev-build', (done) => {
  var iConfig = fn.taskInit();

  if (!iConfig) {
    return done();
  }
  // done();
  fn.supercall('rev-build', done);
});

gulp.task('rev-update', (done) => {
  var iConfig = fn.taskInit();

  if (!iConfig) {
    return done();
  }

  // done();
  fn.supercall('rev-update', done);
});

// - rev




// + watch task
gulp.task('watch', ['all'], () => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }
  var vars = gulp.env.vars;
  var
    watchit = function(glob, op, fn) {
      if (arguments.length == 3) {
        return watch(glob, op, util.debounce(fn, 500));
      } else {
        fn = op;
        return watch(glob, util.debounce(fn, 500));
      }
    };

  watchit(util.joinFormat(vars.srcRoot, '**/**.*'), (file) => {
    var runtimeFiles = fn.srcRelative(file.history, {
      base: vars.srcRoot,
      jslib: util.joinFormat(vars.srcRoot, 'js/lib'),
      alias: vars
    });
    var streamCheck = function() {
      if (!total) {
        util.msg.success('optimize finished');
        runSequence(['concat', 'resource'], 'rev-update', () => {
          fn.supercall('livereload');
          util.msg.success('watch task finished');
        });
      }
    };

    var total = runtimeFiles.length;

    runtimeFiles.forEach((iPath) => {
      var
        rStream = iStream.any2dest(iPath);

      if (rStream) {
        rStream = iStream.dest2dest(rStream, {
          remotePath: gulp.env.remotePath,
          revPath: util.joinFormat(vars.revDest, 'rev-manifest.json'),
          revRoot: vars.revRoot,
          destRoot: vars.destRoot,
          srcRoot: vars.srcRoot,
          cssDest: vars.cssDest,
          htmlDest: vars.htmlDest,
          root: vars.root
        });
        rStream.on('finish', () => {
          total--;
          streamCheck();
        });
      } else {
        total--;
        streamCheck();
      }
    });
  });

  fn.supercall('watch-done');
});
// - watch task

// + all
gulp.task('all', (done) => {
  var iConfig = fn.taskInit();
  if (!iConfig) {
    return;
  }

  runSequence(['js', 'css', 'images', 'html', 'resource'], 'concat', 'rev-build',  () => {
    if (!gulp.env.silent) {
      util.pop('all task done');
    }
    done();
  });
});


gulp.task('watchAll', ['watch']);
// - all
