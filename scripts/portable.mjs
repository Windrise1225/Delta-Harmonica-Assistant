import { mkdir, writeFile, copyFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { zipDirectory, sha256 } from './release-zip.mjs';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const destination=path.join(pkg.build.directories.output,'win-unpacked');
await mkdir(path.join(destination,'data'), { recursive: true });
if((await readdir(path.join(destination,'data'))).length)throw new Error('Release data directory must be empty. Do not package user scores, calibration or logs.');
await mkdir(path.join(destination,'测试曲谱'), { recursive: true });
for(const file of ['TEST_neon_timing.mid','TEST_eight_lanes.dhscore','README.md'])await copyFile('fixtures/'+file,path.join(destination,'测试曲谱',file));
await mkdir(path.join(destination,'第三方许可'),{recursive:true});
for(const [dependency,license] of [['react','LICENSE'],['react-dom','LICENSE'],['scheduler','LICENSE'],['zod','LICENSE'],['lucide-react','LICENSE'],['@tonejs/midi','LICENSE.md'],['midi-file','LICENSE.md'],['array-flatten','LICENSE'],['koffi','LICENSE.txt']]){
  await copyFile(`node_modules/${dependency}/${license}`,`${destination}/第三方许可/${dependency.replace('/','-')}.txt`);
}
await writeFile(path.join(destination,'便携版说明.txt'), 'Delta Harmonica Assistant · Lavender Liquid Glass\r\n运行 Delta Harmonica Assistant.exe 即可。data 文件夹保存曲谱、设置和封面。原版数据目录保持兼容，可将旧版 data 文件夹完整复制到这里继续使用。请将整个文件夹一起移动或压缩分享。无需联网、账号、Node.js 或 Python。\r\n支持 .mid、.midi、.dhscore。未确认的游戏音高默认留空，需要根据游戏实测在设置中校准。内置动画测试可直接使用，且始终标记为测试曲谱。\r\n');
console.log('Portable folder ready:',destination);
for(const file of ['README.md','CHANGELOG.md','KNOWN_ISSUES.md','LICENSE'])await copyFile(file,path.join(destination,file));
await writeFile(path.join(destination,'VERSION.json'),JSON.stringify({version:pkg.version,platform:'win32',arch:'x64',electron:JSON.parse(await readFile('node_modules/electron/package.json','utf8')).version,portable:true,formats:['mid','midi','dhscore'],networkRecognition:false},null,2));
await writeFile(path.join(destination,'便携版说明.txt'),`Delta Harmonica Assistant v${pkg.version} · Windows 11 x64\r\n解压整个 ZIP 后运行 Delta Harmonica Assistant.exe。不可只复制 EXE。无需安装 Node.js、Python 或开发环境。\r\n请放在可写目录。首次启动是空曲库，音高校准全部留空。用户数据写入 EXE 同目录 data 文件夹。\r\n支持 MIDI / DHScore，不识别 MP3、WAV 等音频，不上传文件，不联网识别。\r\n关闭覆盖窗口会暂停曲谱；快捷键 Ctrl + Shift + F10。关闭鼠标穿透后，可点击覆盖窗口右上角 ×。\r\n升级前备份旧版 data；退出软件后再复制到新版 EXE 同目录。不要在运行软件的目录内重新打包。\r\n详细说明见 README.md 和 KNOWN_ISSUES.md。\r\n`);
const zip=path.join(pkg.build.directories.output,`Delta-Harmonica-Assistant-${pkg.version}-win-x64.zip`);
await zipDirectory(destination,zip);
await writeFile(zip+'.sha256',`${await sha256(zip)}  ${path.basename(zip)}\n`);
console.log('Portable ZIP ready:',zip);
