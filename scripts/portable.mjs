import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const destination=path.join(pkg.build.directories.output,'win-unpacked');
await mkdir(path.join(destination,'data'), { recursive: true });
await mkdir(path.join(destination,'测试曲谱'), { recursive: true });
for(const file of ['TEST_neon_timing.mid','TEST_eight_lanes.dhscore','README.md'])await copyFile('fixtures/'+file,path.join(destination,'测试曲谱',file));
await mkdir(path.join(destination,'第三方许可'),{recursive:true});
for(const [dependency,license] of [['react','LICENSE'],['react-dom','LICENSE'],['scheduler','LICENSE'],['zod','LICENSE'],['lucide-react','LICENSE'],['@tonejs/midi','LICENSE.md'],['midi-file','LICENSE.md'],['array-flatten','LICENSE']]){
  await copyFile(`node_modules/${dependency}/${license}`,`${destination}/第三方许可/${dependency.replace('/','-')}.txt`);
}
await writeFile(path.join(destination,'便携版说明.txt'), 'Delta Harmonica Assistant · Lavender Liquid Glass\r\n运行 Delta Harmonica Assistant.exe 即可。data 文件夹保存曲谱、设置和封面。原版数据目录保持兼容，可将旧版 data 文件夹完整复制到这里继续使用。请将整个文件夹一起移动或压缩分享。无需联网、账号、Node.js 或 Python。\r\n支持 .mid、.midi、.dhscore。未确认的游戏音高默认留空，需要根据游戏实测在设置中校准。内置动画测试可直接使用，且始终标记为测试曲谱。\r\n');
console.log('Portable folder ready:',destination);
