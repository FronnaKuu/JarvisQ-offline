// ─── Desktop Build Script ────────────────────────────────────────────────────
// Bundles the Electron main process, preload, and renderer with esbuild. Uses
// the repo's tsconfig path aliases (`@core/*`, `@platform/*`, `@domain/*`) so
// shared TypeScript modules under `src/` can be imported without relative
// paths. Emits everything under `build/desktop/`.

import { build } from 'esbuild';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'build', 'desktop');
const rendererDir = path.join(outDir, 'renderer');

// esbuild resolves tsconfig `paths` natively — we just have to point it at the
// root tsconfig.json that owns the alias map (`@core/*`, `@platform/*`, etc.).
// Stub mobile-only native bridges. `PerfLogger` static-requires the local
// `modules/device-perf/src` which transitively pulls in react-native and
// expo-modules-core — Flow-typed and meaningless on desktop. We intercept the
// import and hand esbuild an empty module; the try/catch in PerfLogger falls
// back to the EMPTY_SNAPSHOT path unchanged.
const mobileStubPlugin = {
  name: 'mobile-stubs',
  setup(build) {
    build.onResolve({ filter: /modules[\\\/]device-perf/ }, () => ({
      path: 'mobile-stub:device-perf',
      namespace: 'mobile-stub',
    }));
    build.onResolve({ filter: /^(react-native|expo-modules-core)(\/|$)/ }, () => ({
      path: 'mobile-stub:rn',
      namespace: 'mobile-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'mobile-stub' }, () => ({
      contents: 'module.exports = {};',
      loader: 'js',
    }));
  },
};

const sharedOptions = {
  bundle: true,
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  logLevel: 'info',
  tsconfig: path.join(rootDir, 'tsconfig.json'),
  resolveExtensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
  plugins: [mobileStubPlugin],
};

// Force Node/browser conditions respectively. Without this, packages with a
// `react-native` conditional export (like zustand@5) are resolved to their
// Flow-typed RN entry, which esbuild cannot parse.
const NODE_CONDITIONS = ['node', 'import', 'require', 'default'];
const BROWSER_CONDITIONS = ['browser', 'import', 'require', 'default'];

async function buildMain() {
  await build({
    ...sharedOptions,
    entryPoints: [path.join(rootDir, 'electron', 'main.ts')],
    outfile: path.join(outDir, 'main.mjs'),
    platform: 'node',
    target: 'node20',
    format: 'esm',
    conditions: NODE_CONDITIONS,
    external: ['electron', '@qvac/sdk'],
    banner: {
      js: [
        "import { createRequire as __createRequire } from 'node:module';",
        "const require = __createRequire(import.meta.url);",
      ].join('\n'),
    },
  });
}

async function buildPreload() {
  await build({
    ...sharedOptions,
    entryPoints: [path.join(rootDir, 'electron', 'preload.ts')],
    outfile: path.join(outDir, 'preload.cjs'),
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    conditions: NODE_CONDITIONS,
    external: ['electron'],
  });
}

async function buildRenderer() {
  await build({
    ...sharedOptions,
    entryPoints: [path.join(rootDir, 'electron', 'renderer', 'index.ts')],
    outfile: path.join(rendererDir, 'index.js'),
    platform: 'browser',
    target: 'chrome120',
    format: 'esm',
    conditions: BROWSER_CONDITIONS,
  });

  await copyFile(
    path.join(rootDir, 'electron', 'renderer', 'index.html'),
    path.join(rendererDir, 'index.html'),
  );
  await copyFile(
    path.join(rootDir, 'electron', 'renderer', 'styles.css'),
    path.join(rendererDir, 'styles.css'),
  );
}

async function writePackageJson() {
  // A tiny package.json inside the output tells Node to treat .mjs as ESM and
  // locks the entry point that electron-builder picks up.
  const payload = {
    name: 'jarvisq-desktop',
    private: true,
    main: 'main.mjs',
    type: 'module',
  };
  await writeFile(
    path.join(outDir, 'package.json'),
    JSON.stringify(payload, null, 2),
  );
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(rendererDir, { recursive: true });

  await Promise.all([buildMain(), buildPreload(), buildRenderer()]);
  await writePackageJson();

  console.log(`\n✓ Desktop bundle ready at ${path.relative(rootDir, outDir)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
