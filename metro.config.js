// ─── Metro Config ─────────────────────────────────────────────────────────────
// Extends the default Expo Metro config with path alias resolution.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Path alias resolution (mirrors tsconfig.json paths)
config.resolver.alias = {
  '@app': path.resolve(__dirname, 'src/app'),
  '@features': path.resolve(__dirname, 'src/features'),
  '@core': path.resolve(__dirname, 'src/core'),
  '@domain': path.resolve(__dirname, 'src/domain'),
  '@data': path.resolve(__dirname, 'src/data'),
  '@ui': path.resolve(__dirname, 'src/ui'),
  '@platform': path.resolve(__dirname, 'src/platform'),
};

module.exports = config;
