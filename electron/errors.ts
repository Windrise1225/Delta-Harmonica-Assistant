export function userMessage(error:unknown){
  const code=(error as NodeJS.ErrnoException)?.code;
  if(code==='EACCES'||code==='EPERM')return '没有权限读写这个位置。请将软件或曲谱放到可读写的文件夹后重试。';
  if(code==='ENOENT')return '找不到文件，可能已被移动或删除。请重新选择曲谱。';
  if(code==='ENOSPC')return '磁盘空间不足，请清理空间后重试。';
  if(error instanceof SyntaxError)return '文件内容无法读取，请选择有效的 DHScore 曲谱或备份文件。';
  return error instanceof Error?error.message:'操作未完成，请稍后重试。';
}
