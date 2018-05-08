var HtmlWebpackPlugin = require('html-webpack-plugin');
var path = require('path')

module.exports = {
    entry: {
      app: './src/boot/index.js'
    },
    output: {
      filename: 'bundle.js',
      publicPath: '/',
      path: path.resolve(__dirname, 'dist')
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          loader: 'babel-loader',
        },
        {
          test: /\.js$/,
          loader: 'es3ify-loader',
          enforce: 'pre'
        },
        {
          test: /\.(png|jpg|gif)$/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: '[path][name].[ext]',
              }
            }
          ]
        }
      ],
    },
    plugins: [new HtmlWebpackPlugin({
        template: './src/boot/index.html'
    })]
  };
  