const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    'geometry-web-worker': './src/api.js'
  },
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, "..", 'dist'),
    filename: '[name].js',
    library: {
      name: "geometry_web_worker",
      type: 'umd'
    }
  },
  module: {
    strictExportPresence: true,


    rules: [
      {
        test: /worker\.js$/,
        loader: 'worker-loader',
        options: {
          filename: '[name].js',
          inline: 'no-fallback'
        }
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
        patterns: [
            { from: 'src/*.d.ts', to: '[name][ext]' }
        ]
    })
  ],
  resolve:
  { 
    fallback: 
    { 
      "buffer": false,
      "fs": false
    }
  }
};