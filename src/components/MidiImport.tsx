import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileMusic, Layers, Keyboard, AlertTriangle } from 'lucide-react';
import { convertMidi, type MidiDocument } from '../core/midi';
import type { Score, Settings } from '../core/schema';
import { formatTime } from '../core/timeline';
import type { Translate } from './SettingsPanel';
import { api } from '../bridge';
export function MidiImport({document,settings,t,onSaved,onError,goMapping,onBack}:{document:MidiDocument;settings:Settings;t:Translate;onSaved:(scores:Score[])=>void;onError:(message:string)=>void;goMapping:()=>void;onBack:()=>void}){
  const [track,setTrack]=useState(document.recommended),[busy,setBusy]=useState(false);
  const converted=useMemo(()=>convertMidi(document,track,settings,crypto.randomUUID(),new Date().toISOString()),[document,track,settings]);
  const save=async()=>{setBusy(true);try{const scores=await api.call<Score[]|null>('score.save',converted.score);if(scores)onSaved(scores);}catch(e){onError((e as Error).message);}finally{setBusy(false);}};
  return <>
    <button className="text-button back" onClick={onBack}><ArrowLeft size={15}/>{t('返回曲库','Back to library')}</button>
    <div className="page-heading"><div><p className="eyebrow">MIDI TO HARMONICA</p><h1>{t('准备你的旋律','Prepare your melody')}</h1><p>{t('选择旋律轨道，确认映射，然后开始演奏。','Choose a melody track, check the mapping, and get ready to play.')}</p></div><span className="local-tag">{t('完全离线','Entirely offline')}</span></div>
    <section className="panel midi-summary"><div className="file-icon"><FileMusic size={30}/></div><div><h2>{document.name}</h2><p>{formatTime(document.duration)} <i>·</i> {document.bpm.toFixed(1).replace('.0','')} BPM <i>·</i> {document.timing.meters[0].numerator}/{document.timing.meters[0].denominator} <i>·</i> {document.tracks.length} {t('个旋律候选轨道','melody candidate tracks')}</p></div>{document.test&&<span className="badge amber">{t('测试 MIDI','TEST MIDI')}</span>}</section>
    <section className="panel"><h3><Layers size={18}/>{t('旋律轨道','Melody track')}</h3><p className="muted">{t('根据单音比例、音区及轨道名称推荐。默认取所选轨道的高声部，自动排除打击乐；复杂编曲可手动更换轨道。','Recommended by monophony, register and track name. The highest voice of the selected track is kept; percussion is excluded. Change tracks for complex arrangements.')}</p><div className="track-options">{document.tracks.map(candidate=><label className={`track-option ${track===candidate.index?'selected':''}`} key={candidate.index}><input type="radio" name="track" value={candidate.index} checked={track===candidate.index} onChange={()=>setTrack(candidate.index)}/><div><b>{candidate.name}</b><small>{candidate.instrument} · {candidate.noteCount} {t('个音符','notes')}</small></div>{candidate.index===document.recommended&&<span className="badge">{t('推荐','Recommended')}</span>}<Check size={17}/></label>)}</div></section>
    <div className="import-stats"><div><span>{t('原轨道音符','Source notes')}</span><strong>{converted.track.noteCount}</strong></div><div><span>{t('单音旋律片段','Melody segments')}</span><strong>{converted.track.notes.length}</strong></div><div><span>{t('可靠映射','Confirmed keys')}</span><strong className="mint">{converted.notes.length}</strong></div><div><span>{t('跳过未确认音高','Unconfirmed pitches skipped')}</span><strong className="amber-text">{converted.skipped}</strong></div></div>
    {converted.skipped>0&&<div className="notice warning"><AlertTriangle size={18}/><div>{t(`有 ${converted.skipped} 个音符没有可靠的游戏映射，不会生成按键。请先校准相应音高。`,`No confirmed mapping for ${converted.skipped} notes. These will be skipped. Calibrate the corresponding pitches first.`)}<button className="text-button" onClick={goMapping}><Keyboard size={14}/>{t('前往音高校准','Open pitch calibration')}<ArrowRight size={14}/></button></div></div>}
    {document.warnings.map(w=><div className="notice" key={w}>{t(w,w.includes('弯音')?'Pitch bends are present. Only the original MIDI pitches are converted.':'Sustain pedal events are present. Durations follow MIDI Note Off events.')}</div>)}
    <div className="import-actions"><span>{t('保留原始节奏和音符长度，不播放音频。','Original timing and note lengths are preserved. No audio playback.')}</span><button className="button primary" disabled={busy||!converted.notes.length} onClick={()=>void save()}>{busy?t('正在保存…','Saving…'):t('保存到曲库','Save to library')}<ArrowRight size={16}/></button></div>
  </>;
}
