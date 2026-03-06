const rules = require('./webpack.rules');

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  // Put your normal webpack config below here
  module: {
    rules,
  },
  devServer: {
    historyApiFallback: {
      rewrites: [
        { from: /^\/$/, to: '/main_window/index.html' },
      ],
    },
  },
  resolve: {
    fallback: {
      fs: false,
      path: false,
      electron: false,
    },
  },
};
