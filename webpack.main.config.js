const webpack = require('webpack');
module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.js',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  plugins: [
    // systeminformation optionally requires these native macOS sensor modules.
    // They are not needed for this app's snapshot flow, so ignore them at bundle time.
    new webpack.IgnorePlugin({ resourceRegExp: /^osx-temperature-sensor$/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^macos-temperature-sensor$/ }),
  ],
};