import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist-electron', { recursive: true });
await Promise.all(['main', 'preload'].map((entry) => build({
  entryPoints: [`electron/${entry}.ts`],
  outfile: `dist-electron/${entry}.cjs`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: false,
  minify: false,
})));
