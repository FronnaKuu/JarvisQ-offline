// ─── Metro Config ─────────────────────────────────────────────────────────────
// Extends the default Expo Metro config to:
//   1. Treat worklet/bundle.js as a raw asset (not parsed/transpiled by Metro)
//      so react-native-bare-kit can receive it as a string.
//   2. Resolve path aliases matching tsconfig.json.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Tell Metro to treat .bundle files as raw text assets instead of JS modules.
// This allows `require('./worklet/bundle.js')` to return the raw source string.
config.resolver.assetExts = config.resolver.assetExts ?? [];
config.resolver.sourceExts = (config.resolver.sourceExts ?? []).filter(
  (ext) => ext !== 'bundle',
);
// Add .bundle to asset extensions so Metro copies it as-is
if (!config.resolver.assetExts.includes('bundle')) {
  config.resolver.assetExts.push('bundle');
}

// Path alias resolution (mirrors tsconfig.json paths)
config.resolver.alias = {
  '@app': path.resolve(__dirname, 'src/app'),
  '@features': path.resolve(__dirname, 'src/features'),
  '@core': path.resolve(__dirname, 'src/core'),
  '@domain': path.resolve(__dirname, 'src/domain'),
  '@data': path.resolve(__dirname, 'src/data'),
  '@ui': path.resolve(__dirname, 'src/ui'),
  '@worklet': path.resolve(__dirname, 'worklet'),
};

module.exports = config;
