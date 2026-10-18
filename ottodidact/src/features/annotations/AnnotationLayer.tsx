import { useMemo, type CSSProperties } from 'react';
import type { Marker, Branch } from '@shared/milestone';
import type { Rect } from '@shared/types';
import { annotationColor, markerBounds } from '@shared/presentation';
import { organizeAnnotations } from '@shared/annotationOrganization';
import { dispatch } from '../../state/sessionStore';
import { attendAnnotation } from './useAnnotationAttention';

export function AnnotationLayer({annotations,branches,activeId,mainBounds,controlsOnly=false}:{annotations:Marker[];branches:Record<string,Branch>;activeId?:string;mainBounds?:Rect;controlsOnly?:boolean}) {
  const plan=useMemo(()=>organizeAnnotations(annotations,branches,activeId,mainBounds),[annotations,branches,activeId,mainBounds]);
  return <div className={'annotation-layer'+(controlsOnly?' annotation-controls':' annotation-graphics')} data-crowded={plan.crowded}>
    {!controlsOnly&&<svg className="explanation-leaders" aria-hidden="true">{plan.marks.map(({marker:a,route,opacity,visible})=>{
      if(!visible||!route)return null;
      const color=annotationColor(a.number),id='leader-'+a.id.replace(/[^a-zA-Z0-9_-]/g,'-'),from=route.points[0];
      return <g key={a.id} data-route-for={a.id} className="organized-mark" style={{opacity}}><defs><marker id={id} markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill={color} style={{stroke:'none',fill:color}}/></marker></defs>{route.connected&&<circle cx={from.x} cy={from.y} r="3" fill={color}/>}<path d={route.path} stroke={color} markerEnd={`url(#${id})`}/></g>;
    })}</svg>}
    {plan.marks.map(({marker:annotation,annotationId,opacity,visible,primary})=>{
      const bounds=annotation.kind==='arrow'?(annotation.target??annotation.bounds):markerBounds(annotation),padding=10,color=annotationColor(annotation.number);
      const Tag=controlsOnly?'button':'div';
      return <Tag key={annotation.id} className={'marker organized-mark marker-'+annotation.kind} data-marking-id={annotation.id} data-annotation-id={annotationId} data-visible={visible} data-primary={primary}
        style={{'--annotation-color':color,left:bounds.x-padding,top:bounds.y-padding,width:bounds.width+padding*2,height:bounds.height+padding*2,padding,opacity,visibility:visible?'visible':'hidden'} as CSSProperties}
        aria-hidden={!visible||!controlsOnly} tabIndex={controlsOnly&&visible?0:-1}
        aria-label={annotation.number+' - '+(annotation.concept||annotation.kind)+' - open annotation chat'}
        title={controlsOnly?annotation.concept+' - resume chat':undefined}
        onMouseEnter={controlsOnly?()=>attendAnnotation(annotationId,'hover',true):undefined} onMouseLeave={controlsOnly?()=>attendAnnotation(annotationId,'hover',false):undefined}
        onFocus={controlsOnly?()=>attendAnnotation(annotationId,'focus',true):undefined} onBlur={controlsOnly?()=>attendAnnotation(annotationId,'focus',false):undefined}
        onClick={controlsOnly?()=>dispatch({type:'openBranch',annotationId}):undefined}>
        {controlsOnly?<span className="marker-number">{annotation.number}</span>:annotation.kind==='arrow'?null:
          <svg viewBox={'0 0 '+bounds.width+' '+bounds.height} preserveAspectRatio="none" aria-hidden="true">
            {annotation.kind==='underline'?<path d={'M0 '+bounds.height+' H'+bounds.width}/>:
              annotation.kind==='highlight'||annotation.kind==='rectangle'?<rect width={bounds.width} height={bounds.height} fill={annotation.kind==='rectangle'?'none':color} fillOpacity=".13" stroke={color} strokeWidth="1.5"/>:
              <ellipse cx={bounds.width/2} cy={bounds.height/2} rx={bounds.width/2} ry={bounds.height/2}/>}
          </svg>}
      </Tag>;
    })}
  </div>;
}
