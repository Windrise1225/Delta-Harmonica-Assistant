import { build } from 'esbuild';
import { nodeFileReader } from './read-source-plugin.mjs';

await build({ entryPoints: ['electron/main.ts', 'electron/preload.ts'], outdir: 'dist-electron', outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'koffi'], sourcemap: true, plugins: [nodeFileReader] });
