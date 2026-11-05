import { build } from 'esbuild';
import { nodeFileReader } from './read-source-plugin.mjs';
await build({entryPoints:['src/core/schema.ts'],bundle:true,format:'esm',platform:'node',outfile:'.cache/ui-test-core.mjs',plugins:[nodeFileReader]});
