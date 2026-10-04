module.exports = function (api) {
  const isProd = api.env('production');
  const plugins = [];

  // Produkční bundle: odstraň console.log/info/debug (error + warn nech).
  // Dev/Metro — plugin nepřidávej, logy zůstanou.
  if (isProd) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  // Reanimated musí být poslední.
  plugins.push('react-native-reanimated/plugin');

  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins,
  };
};
