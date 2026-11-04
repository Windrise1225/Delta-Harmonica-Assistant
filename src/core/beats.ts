import type { Score, Timing } from './schema';
export function ticksToSeconds(timing:Timing,ticks:number){
  let tempo=timing.tempos[0];for(const candidate of timing.tempos){if(candidate.ticks>ticks)break;tempo=candidate;}
  return tempo.time+(ticks-tempo.ticks)/timing.ppq*60/tempo.bpm;
}
export function secondsToTicks(timing:Timing,time:number){
  let tempo=timing.tempos[0];for(const candidate of timing.tempos){if(candidate.time>time)break;tempo=candidate;}
  return tempo.ticks+(time-tempo.time)*tempo.bpm/60*timing.ppq;
}
export function bpmAt(score:Score,time:number){let bpm=score.bpm;for(const event of score.timing?.tempos??[]){if(event.time>time)break;bpm=event.bpm;}return bpm;}
export function beatLines(score:Score,from:number,to:number):{time:number;downbeat:boolean}[]{
  const timing=score.timing;
  if(!timing){if(!score.bpm)return [];const step=60/score.bpm;return Array.from({length:Math.min(200,Math.ceil((to-from)/step)+2)},(_,i)=>{const n=Math.max(0,Math.floor(from/step))+i;return {time:n*step,downbeat:n%4===0};});}
  const first=secondsToTicks(timing,Math.max(0,from)),last=secondsToTicks(timing,to),output:{time:number;downbeat:boolean}[]=[];
  for(let i=0;i<timing.meters.length;i++){
    const meter=timing.meters[i],end=timing.meters[i+1]?.ticks??Infinity;if(end<first||meter.ticks>last)continue;
    const step=timing.ppq*4/meter.denominator;
    for(let n=Math.max(0,Math.floor((first-meter.ticks)/step));meter.ticks+n*step<Math.min(end,last+step)&&output.length<200;n++){
      const ticks=meter.ticks+n*step;output.push({time:ticksToSeconds(timing,ticks),downbeat:n%meter.numerator===0});
    }
  }
  return output;
}
