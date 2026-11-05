import { readFile } from 'node:fs/promises';
// Let Node read JavaScript when local file-protection software prevents the
// esbuild native helper from reading it directly. No source files are rewritten.
export const nodeFileReader={name:'node-file-reader',setup(build){
  build.onLoad({filter:/\.[cm]?js$/},async({path})=>({contents:await readFile(path,'utf8'),loader:'js'}));
}};
