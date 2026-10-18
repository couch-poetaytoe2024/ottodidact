// One tiny transparent draw: warped color, glass, rim and scattered light.
// No framebuffer bloom pass (which would otherwise blur/flatten the alpha).
export const liquidVertex = `
attribute vec2 aPosition;
varying vec2 vUv;
void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}
`;

export const liquidFragment = `
precision highp float;
varying vec2 vUv;
uniform float uPhase;
uniform float uPixel;
uniform float uHalo;
uniform float uExtent;
uniform float uBody;
uniform vec4 uClip;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float fbm(vec2 p){return .57*noise(p)+.28*noise(p*2.07+5.2)+.15*noise(p*4.11-3.7);}
mat2 turn(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec3 pigment(vec2 p){
 // Independently travelling pools, not a rotation of one fixed texture. Their
 // radii and aspect ratios change, letting every hue cross the centre and rim.
 float t=uPhase;
 vec2 q=p+.2*vec2(sin(p.y*2.7+sin(t)),sin(p.x*2.4+cos(t)));
 float goldAngle=t+3.7+.28*sin(t),redAngle=t+1.6+.3*sin(t+1.),blueAngle=t+.25+.42*sin(t*2.);
 vec2 gold=(.61+.19*sin(t+2.))*vec2(cos(goldAngle),sin(goldAngle));
 vec2 red=(.61+.18*cos(t+.7))*vec2(cos(redAngle),sin(redAngle));
 vec2 blue=(.56+.27*sin(t+.8))*vec2(cos(blueAngle),sin(blueAngle));
 vec2 g=(q-gold)*vec2(1.+.15*sin(t),1.-.15*sin(t));
 vec2 h=(q-red)*vec2(1.-.16*cos(t),1.+.16*cos(t));
 vec2 b=(q-blue)*vec2(1.+.18*cos(t+.5),1.-.18*cos(t+.5));
 float wg=exp(-3.2*dot(g,g)),wr=exp(-3.2*dot(h,h)),wb=.95*exp(-8.5*dot(b,b));
 float warmth=wr/(wg+wr+.0001);
 vec3 color=mix(vec3(1.,.62,.008),vec3(1.,.018,.028),smoothstep(.03,.98,warmth));
 float cool=wb/(wg+wr+wb+.0001);
 color=mix(color,vec3(.86,.015,.46),smoothstep(0.,.42,cool));
 color=mix(color,vec3(.055,.1,1.),smoothstep(.22,.72,cool));
 color=mix(color,vec3(.015,.87,1.),smoothstep(.65,1.,cool));
 return color;
}
void main(){
 vec2 p=vec2(vUv.x,1.-vUv.y)*2.*uExtent-uExtent;
 float r=length(p),aa=uPixel*1.15;
 vec2 onEdge=p/max(r,1.);
 float coverage=1.-smoothstep(1.-aa,1.+aa,r);
 float z=sqrt(max(0.,1.-r*r));
 // Curved transmission through the lens, rather than a flat painted disc.
 // Thickness bends the same moving color field beneath a clear surface.
 vec2 refracted=onEdge*(.74+.26*z);
 vec3 transmitted=pigment(refracted);
 // A clear, lit front and a shaded shoulder distinguish a sphere from a
 // flat colored badge. Keep the shadow beneath, rather than on, the rim.
 vec3 normal=vec3(p,z);
 float facingLight=max(0.,dot(normal,normalize(vec3(-.45,-.55,.85))));
 vec3 color=transmitted*(.44+.56*z)*(.86+.14*facingLight);
 float shoulder=smoothstep(.55,.88,r)*(1.-smoothstep(.91,1.,r));
 color*=1.-shoulder*(.08+.2*max(0.,dot(onEdge,vec2(.72,.68))));
 float rimBand=exp(-pow((r-.949)/.043,2.));
 color+=pigment(onEdge)*rimBand*(.67+.27*max(0.,-p.x));
 // One curved soft-box reflection: a narrow glossy core nested in a wider
 // translucent reflection. Its diagonal follows the upper-left curvature;
 // it does not introduce white contour lines or surface texture.
 vec2 reflection=turn(.62)*(p-vec2(-.43,-.51));
 reflection.x+=.28*reflection.y*reflection.y;
 vec2 reflectionSoft=reflection/vec2(.25,.41);
 float softKey=.24*exp(-dot(reflectionSoft,reflectionSoft)*1.35);
 color=mix(color,vec3(1.,.98,.72),softKey);
 vec2 reflectionCore=reflection/vec2(.125,.29);
 float key=.96*(1.-smoothstep(.16,1.,dot(reflectionCore,reflectionCore)));
 color=mix(color,vec3(1.,1.,.94),key);
 vec2 side=turn(.17)*(p-vec2(.825,-.2))/vec2(.075,.36);
 color=mix(color,vec3(1.,.83,.95),.25*exp(-dot(side,side)*1.3));
 // A soft internal reflection carries the local pigment, so it follows the
 // liquid instead of permanently pinning a cyan spot to the lower right.
 vec2 bounce=turn(-.6)*(p-vec2(.38,.68))/vec2(.34,.14);
 float innerLight=.86*exp(-dot(bounce,bounce)*1.1);
 color=mix(color,min(vec3(1.),transmitted*2.7+vec3(.035)),innerLight);
 float rim=exp(-pow((r-.986)/max(.013,aa*.7),2.));
 float facing=dot(normalize(p+vec2(.0001)),normalize(vec2(-.7,-.8)));
 float shine=.84+.15*pow(abs(facing),2.);
 color=mix(color,vec3(1.,1.,.96),rim*shine);
 float bodyAlpha=coverage*.985*uBody;
 float d=max(0.,r-1.);
 float mist=fbm(p*2.+vec2(sin(uPhase),cos(uPhase))*.6);
 float halo=(.64*exp(-d*11.)+.24*exp(-d*2.8)+.22*exp(-d*1.1))*(.9+.1*mist);
 // A broad, faint spill at the nearby bottom surface. Its strength declines
 // with distance; dragging Otto away removes the interaction naturally.
 float bottomDistance=max(0.,uClip.w-1.);
 float contact=.14*exp(-pow(p.x/1.55,2.))*exp(-max(0.,uClip.w-p.y)*2.4)*exp(-bottomDistance*.65);
 halo+=contact*(1.-uBody);
 halo*=(1.-smoothstep(uExtent-.3,uExtent-.04,r))*uHalo;
 // Premultiplied transparent falloff; retain the approved narrow edge core.
 float room=smoothstep(0.,.07,p.x-uClip.x)*smoothstep(0.,.07,p.y-uClip.y)
           *smoothstep(0.,.07,uClip.z-p.x)*smoothstep(0.,.07,uClip.w-p.y);
 halo*=room*(1.-coverage);
 // Lighting/pigment blending is linear. Convert to display color BEFORE alpha
 // multiplication, otherwise translucent light gains dark, muddy fringes.
 color=pow(max(color,vec3(0.)),vec3(1./2.2));
 // Increasing angular diffusion prevents a concentrated pool from becoming
 // a long colored ray. Near the rim it still matches the adjacent surface.
 vec3 edgeColor=pigment(onEdge);
 vec3 scattered=edgeColor*.3+(pigment(turn(.7)*onEdge)+pigment(turn(-.7)*onEdge))*.35;
 vec3 glow=pow(max(mix(edgeColor,scattered,smoothstep(.05,.65,d)) *1.35,vec3(0.)),vec3(1./2.2));
 float alpha=bodyAlpha+halo*(1.-bodyAlpha);
 vec3 premult=color*bodyAlpha+glow*halo*(1.-bodyAlpha);
 // Electron composites premultiplied RGBA. Zero alpha always has zero RGB.
 gl_FragColor=vec4(min(premult,vec3(alpha)),alpha);
}
`;
