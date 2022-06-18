const webpack = require('webpack')
const path = require('path')
// const CleanWebpackPlugin = require('clean-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

// Use the shim() function to stub out unneeded modules. Used to cut down
// bundle size since tree-shaking doesn't work with Typescript modules.
//
const shimJS = path.resolve(__dirname, '../src/js', 'emptyshim.js')
function shim(regExp) {
  return new webpack.NormalModuleReplacementPlugin(regExp, shimJS)
}

const config = {
  mode: 'production',
  performance: {
    hints: false,
  },
  entry: {
    index: './src/js/index.js',
  },
  output: {
    filename: 'j1-nbinteract-core.js',
    path: path.resolve(__dirname, '../lib'),
  },
  devtool: 'cheap-module-eval-source-map',
  devServer: {
    contentBase: './',
  },
  plugins: [
    shim(/moment/),
    shim(/comment-json/),

    shim(/@jupyterlab\/apputils/),
    shim(/@jupyterlab\/codemirror/),
    shim(/codemirror\/keymap\/vim/),
    shim(/codemirror\/addon\/search/),

    shim(/elliptic/),
    shim(/bn\.js/),
    shim(/readable\-stream/),

    // shim out some unused phosphor
    shim(
      /@phosphor\/widgets\/lib\/(commandpalette|box|dock|grid|menu|scroll|split|stacked|tab).*/,
    ),
    shim(/@phosphor\/(dragdrop|commands).*/),

    shim(/@jupyterlab\/codeeditor\/lib\/jsoneditor/),
    shim(/@jupyterlab\/coreutils\/lib\/(time|settingregistry|.*menu.*)/),
    shim(/@jupyterlab\/services\/lib\/(session|contents|terminal)\/.*/),

    // see: https://github.com/johnagan/clean-webpack-plugin
    new CleanWebpackPlugin ({
      // Options and Defaults
      //
      // Simulate the removal of files
      //
      // default: false
      dry: false,
      // Write Logs to Console (always enabled when dry is true)
      //
      // default: false
      verbose: false,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              [
                '@babel/preset-env',
                {
                  targets: { browsers: ['last 2 Chrome versions'] },
                  useBuiltIns: 'entry',
                  modules: false,
                },
              ],
            ],
            plugins: ['@babel/plugin-syntax-dynamic-import'],
            cacheDirectory: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
}

module.exports = config
