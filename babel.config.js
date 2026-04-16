module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '@app': './src/app',
            '@features': './src/features',
            '@core': './src/core',
            '@domain': './src/domain',
            '@data': './src/data',
            '@ui': './src/ui',
            '@platform': './src/platform',
            '@worklet': './worklet',
          },
        },
      ],
      'expo-router/babel',
    ],
  };
};
