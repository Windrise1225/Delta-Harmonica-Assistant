import { build } from 'esbuild';
await build({entryPoints:['src/core/schema.ts'],bundle:true,format:'esm',platform:'node',outfile:'.cache/ui-test-core.mjs'});
