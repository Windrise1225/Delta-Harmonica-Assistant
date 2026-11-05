import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Overlay } from './Overlay';
import './style.css';
import './readability.css';
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="fatal"><h1>界面暂时无法显示</h1><p>请关闭软件后重新打开。已保存的曲谱仍保留在本地。</p></div>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<Boundary>{new URLSearchParams(location.search).has('overlay')?<Overlay/>:<App/>}</Boundary>);
