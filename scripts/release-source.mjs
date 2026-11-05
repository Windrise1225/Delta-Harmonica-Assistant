import { mkdir, mkdtemp, readdir, readFile, copyFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { zipDirectory, sha256 } from './release-zip.mjs';

const root=process.cwd();
const pkg=JSON.parse(await readFile('package.json','utf8'));
const output=path.resolve(pkg.build.directories.output);
await mkdir(output,{recursive:true});
const stage=await mkdtemp(path.join(output,'.source-stage-'));
const source=path.join(stage,`Delta-Harmonica-Assistant-${pkg.version}-source`);
const roots=['assets','docs','electron','fixtures','scripts','src','tests'];
const files=['.gitignore','package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','README.md','CHANGELOG.md','KNOWN_ISSUES.md','LICENSE'];
async function collect(relative){
  for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
    const file=path.posix.join(relative,entry.name);
    if(entry.isSymbolicLink())throw new Error(`Source archive cannot include a symlink: ${file}`);
    if(entry.isDirectory())await collect(file);else files.push(file);
  }
}
for(const directory of roots)await collect(directory);
const findings=[];
const prohibited=/(?:^|\/)(?:node_modules|data|artifacts|release|dist|dist-electron|\.cache|\.git|\.env)(?:\/|$)|\.(?:wav|mp3|flac|m4a|ogg|aac|log|tmp|bak|pem|key)$/i;
const secrets=/(?:sk-proj-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const personalPath=/[A-Za-z]:[\\/](?:Users|project)[\\/]|\/(?:Users|home)\/[a-zA-Z0-9_.-]+\//;
const manifest=[];
for(const file of files.sort()){
  if(prohibited.test(file))throw new Error(`Refusing private/generated source file: ${file}`);
  const absolute=path.join(root,file);
  if(!(await lstat(absolute)).isFile())throw new Error(`Expected source file: ${file}`);
  if(/\.(?:ts|tsx|mjs|json|md|css|html|ps1)$/.test(file)||file==='.gitignore'){
    const content=await readFile(absolute,'utf8');
    if(secrets.test(content))findings.push({file,kind:'credential pattern'});
    if(personalPath.test(content))findings.push({file,kind:'personal absolute path'});
  }
  await mkdir(path.dirname(path.join(source,file)),{recursive:true});
  await copyFile(absolute,path.join(source,file));
  manifest.push({path:file,sha256:await sha256(absolute)});
}
if(findings.length)throw new Error(`Source preflight failed: ${JSON.stringify(findings)}`);
const zip=path.join(output,`Delta-Harmonica-Assistant-${pkg.version}-source.zip`);
await zipDirectory(source,zip);
await writeFile(path.join(output,'SOURCE_MANIFEST.json'),JSON.stringify({version:pkg.version,repository:pkg.repository.url,files:manifest,credentialFindings:findings},null,2));
await writeFile(zip+'.sha256',`${await sha256(zip)}  ${path.basename(zip)}\n`);
console.log(JSON.stringify({sourceZip:path.relative(root,zip),files:files.length,credentialFindings:findings.length,gitHubChangesPublished:false},null,2));
