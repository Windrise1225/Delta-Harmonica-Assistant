import type { Score } from './schema';
import { KEYS } from './schema';
export function testScore(): Score {
  const melody = [0,2,4,2,1,3,5,3,2,4,6,4,3,5,7,5,7,6,5,4,3,2,1,0];
  let time=1;
  return { version:1, id:'00000000-0000-4000-8000-000000000001', name:'霓虹练习 · 动画测试曲谱', createdAt:'2026-01-01T00:00:00.000Z', duration:24, sourceDuration:24, segment:[0,24], bpm:100, test:true,
    notes:melody.map((key,i)=>{const duration=i%6===4?1.5:.32; const n={key:KEYS[key],start:time,duration,mouse:(i%8===3?'left':i%8===6?'right':'none') as 'none'|'left'|'right'}; time+=i%6===4?1.8:.6;return n;}) };
}
