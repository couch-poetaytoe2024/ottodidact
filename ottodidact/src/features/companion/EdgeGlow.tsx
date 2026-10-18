import { useEffect,useRef,useState } from 'react';
import { LAUNCHER_HALO_EXTENT,LIGHT_GRADIENT,type LightGeometry } from '@shared/ambientLight';
import { LiquidGlass } from '../../components/LiquidGlass';
import { useEdgeClock, edgeAnimationDuration } from './useAmbientLight';
export function EdgeGlow({strength='bright',launcher=false}:{strength?:'bright'|'faint';launcher?:boolean}) {
  const light=useRef<HTMLDivElement>(null);useEdgeClock(light);
  const [geometry,setGeometry]=useState<LightGeometry>();
  useEffect(()=>{
    const bridge=window.ottodidact;if(!launcher||!bridge)return;
    let alive=true;
    void bridge.getLightGeometry().then(value=>{if(alive)setGeometry(value);}).catch(()=>{});
    const stop=bridge.subscribeLightGeometry(setGeometry);
    return()=>{alive=false;stop();};
  },[launcher]);
  const center=launcher&&geometry?.visible?{x:geometry.window.x-geometry.display.x+geometry.window.width/2,y:geometry.window.y-geometry.display.y+geometry.window.height/2}:undefined;
  const texture=()=> <div className="edge-light" style={{background:LIGHT_GRADIENT,animationDuration:edgeAnimationDuration}}/>;
  return <>
    <div ref={light} className={'edge-glow edge-glow-'+strength} aria-hidden="true">
      <div className="edge-space"><div className="edge-haze">{texture()}</div></div>
      <div className="edge-core">{texture()}</div>
    </div>
    {center&&geometry&&<div className="launcher-radiance" aria-hidden="true" style={{left:center.x-38,top:center.y-38}}>
      <LiquidGlass motion halo={strength==='bright'?1:.24} haloOnly extent={LAUNCHER_HALO_EXTENT} lightGeometry={geometry}/>
    </div>}
  </>;
}
