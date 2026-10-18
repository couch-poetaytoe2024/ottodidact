import { useLayoutEffect, useRef } from 'react';
import { EDGE_CORE_WIDTH,LIGHT_SOURCE_GAP,LIGHT_PERIOD_MS,lightPhase,type LightGeometry } from '@shared/ambientLight';
import { liquidFragment,liquidVertex } from './liquidMaterial';

/** A small GPU surface with explicit alpha, visibility and context-loss handling. */
export function LiquidGlass({motion,halo,extent=108/76,haloOnly=false,lightGeometry}:{motion:boolean;halo:number;extent?:number;haloOnly?:boolean;lightGeometry?:LightGeometry}) {
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const options=useRef({motion,halo,extent,haloOnly,lightGeometry});options.current={motion,halo,extent,haloOnly,lightGeometry};
 useLayoutEffect(()=>{
  const canvas=canvasRef.current!,face=canvas.parentElement!;
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
  if(!gl){face.dataset.material='fallback';return;}
  let program:WebGLProgram|null=null,buffer:WebGLBuffer|null=null;
  let uniforms:Record<string,WebGLUniformLocation|null>={},frame=0,last=0,count=0,visible=false,lost=false,disposed=false;
  let geometry:LightGeometry|undefined;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const compile=(type:number,source:string)=>{
   const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(error??'Liquid material compilation failed');}
   return shader;
  };
  const initialize=()=>{
   let vertex:WebGLShader|undefined,fragment:WebGLShader|undefined;
   try{
    vertex=compile(gl.VERTEX_SHADER,liquidVertex);fragment=compile(gl.FRAGMENT_SHADER,liquidFragment);
    program=gl.createProgram()!;gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Liquid material linking failed');
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    uniforms=Object.fromEntries(['uPhase','uPixel','uHalo','uClip','uExtent','uBody'].map(name=>[name,gl.getUniformLocation(program!,name)]));
    gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);lost=false;
   }catch(error){
    face.dataset.material='fallback';lost=true;
    gl.deleteProgram(program);gl.deleteBuffer(buffer);program=null;buffer=null;
    console.warn('Otto liquid material unavailable; using gradient fallback.',error);
   }finally{if(vertex)gl.deleteShader(vertex);if(fragment)gl.deleteShader(fragment);}
  };
  const draw=(now:number)=>{
   if(lost||disposed||!program)return;
   const bounds=face.getBoundingClientRect(),ratio=Math.min(devicePixelRatio,2),size=Math.max(1,Math.round(bounds.width*options.current.extent*ratio));
   if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;gl.viewport(0,0,size,size);}
   const animate=options.current.motion&&!media.matches;
   gl.uniform1f(uniforms.uPhase,animate?lightPhase(Date.now())/LIGHT_PERIOD_MS*Math.PI*2:0);
   gl.uniform1f(uniforms.uPixel,2*options.current.extent/size);gl.uniform1f(uniforms.uHalo,options.current.halo);
   gl.uniform1f(uniforms.uExtent,options.current.extent);gl.uniform1f(uniforms.uBody,options.current.haloOnly?0:1);
   const radius=bounds.width/2;
   const currentGeometry=options.current.lightGeometry??geometry;
   if(currentGeometry){
    const {display,window:win}=currentGeometry,origin=options.current.haloOnly?display:win,cx=origin.x+bounds.x+radius,cy=origin.y+bounds.y+radius;
    const gap=EDGE_CORE_WIDTH+LIGHT_SOURCE_GAP;
    // Only the halo's bottom falloff overlaps the existing inward edge light.
    // The light core and launcher position are unchanged.
    const bottom=options.current.haloOnly?EDGE_CORE_WIDTH:gap;
    gl.uniform4f(uniforms.uClip,(display.x+gap-cx)/radius,(display.y+gap-cy)/radius,(display.x+display.width-gap-cx)/radius,(display.y+display.height-bottom-cy)/radius);
   }else gl.uniform4f(uniforms.uClip,-2,-2,2,2);
   gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
   face.dataset.material='webgl';canvas.dataset.materialVersion='glass-lens-3';canvas.dataset.frame=String(++count);canvas.dataset.time=String(now);
  };
  const tick=(now:number)=>{
   const interval=face.clientWidth>40?1000/30:1000/20;
   if(now-last>=interval){draw(now);last=now;}
   frame=requestAnimationFrame(tick);
  };
  const update=()=>{
   cancelAnimationFrame(frame);
   const active=visible&&!document.hidden&&!lost;
   canvas.dataset.running=String(active&&options.current.motion&&!media.matches);
   if(!active)return;
   draw(performance.now());
   if(options.current.motion&&!media.matches)frame=requestAnimationFrame(tick);
  };
  const contextLost=(event:Event)=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);face.dataset.material='fallback';canvas.dataset.running='false';};
  const contextRestored=()=>{initialize();update();};
  canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
  initialize();
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;update();});observer.observe(face);
  const resize=new ResizeObserver(update);resize.observe(face);
  // An existing read-only bridge; no new IPC or per-frame geometry messages.
  let unsubscribe:(()=>void)|undefined;
  const bridge=window.ottodidact;
  if(face.closest('.otto-button')&&bridge){
   void bridge.getLightGeometry().then(value=>{if(!disposed){geometry=value;update();}}).catch(()=>{});
   unsubscribe=bridge.subscribeLightGeometry(value=>{geometry=value;update();});
  }
  // Prop changes do not recreate the WebGL context or remount the eyes.
  const changed=()=>update();canvas.addEventListener('otto-material-options',changed);
  document.addEventListener('visibilitychange',update);media.addEventListener('change',update);window.addEventListener('resize',update);
  return()=>{
   disposed=true;cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();unsubscribe?.();
   document.removeEventListener('visibilitychange',update);media.removeEventListener('change',update);window.removeEventListener('resize',update);
   canvas.removeEventListener('otto-material-options',changed);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);
   gl.deleteBuffer(buffer);gl.deleteProgram(program);delete face.dataset.material;
   // React StrictMode replays effects on the same connected canvas in dev.
   // Lose the context only after a real removal, not during that replay.
   queueMicrotask(()=>{if(!canvas.isConnected)gl.getExtension('WEBGL_lose_context')?.loseContext();});
  };
 },[]);
 useLayoutEffect(()=>{canvasRef.current?.dispatchEvent(new Event('otto-material-options'));},[motion,halo,extent,haloOnly,lightGeometry]);
 return <canvas ref={canvasRef} className="otto-liquid" style={{left:`${-(extent-1)*50}%`,top:`${-(extent-1)*50}%`,width:`${extent*100}%`,height:`${extent*100}%`}} aria-hidden="true"/>;
}
