import { defineConfig } from 'tsup';

const external = [
  'react',
  'react-native',
  'expo-linking',
  'expo-local-authentication',
];

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'otp/index': 'src/otp/index.ts',
    'deep-link/index': 'src/deep-link/index.ts',
    'biometric/index': 'src/biometric/index.ts',
    'hooks/index': 'src/hooks/index.ts',
    'ui/index': 'src/ui/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // Rollup tree-shaking rewrites `require('expo-linking')` into an opaque
  // `__require(...)` shim that Metro cannot resolve, so it must stay off.
  treeshake: false,
  external,
});
