import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// The release target is Windows. Use its built-in ZIP support; the finished
// application contains Electron and never needs Node, PowerShell scripts or Python.
export async function zipDirectory(directory, output) {
  if(process.platform!=='win32')throw new Error('Create the Windows portable release on Windows.');
  const temporary=output.replace(/\.zip$/i,'.partial.zip');
  if(temporary===output)throw new Error('Expected a ZIP output filename.');
  await rm(temporary,{force:true});
  const quote=value=>`'${path.resolve(value).replace(/'/g,"''")}'`;
  const command=`$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath ${quote(directory)} -DestinationPath ${quote(temporary)} -CompressionLevel Optimal -Force`;
  await runPowerShell(command);
  await rename(temporary,output);
}
export async function runPowerShell(command){
  await new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{stdio:'inherit',windowsHide:true});
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`ZIP creation failed (${code}).`)));
  });
}
export async function sha256(file){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
