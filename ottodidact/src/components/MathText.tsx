import { createElement,memo,useMemo,type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** All prose, Markdown and code stay escaped React text. Only KaTeX's generated
 * markup is inserted, with trust disabled and expansion/size bounds. */
function inline(text:string,key:string):ReactNode[] {
  const result:ReactNode[]=[];
  const tokens=/`[^`\n]+`|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\s)(?:[^$\\]|\\.)+?\$|\*\*[^*\n]+\*\*/g;
  let end=0,count=0;
  for(const match of text.matchAll(tokens)){
    if(++count>80)break;
    const start=match.index!,source=match[0],id=key+':'+start;
    result.push(text.slice(end,start));
    if(source.startsWith('`'))result.push(<code key={id}>{source.slice(1,-1)}</code>);
    else if(source.startsWith('**'))result.push(<strong key={id}>{inline(source.slice(2,-2),id)}</strong>);
    else {
      const displayMode=source.startsWith('$$')||source.startsWith('\\['),edge=source.startsWith('$')&&!displayMode?1:2;
      const expression=source.slice(edge,-edge);
      try {
        if(expression.length>4000)throw new Error('Long expression');
        const html=katex.renderToString(expression,{displayMode,throwOnError:false,trust:false,strict:'error',maxExpand:500,maxSize:20,output:'htmlAndMathml',macros:{}});
        result.push(<span key={id} className={displayMode?'math-display':'math-inline'} dangerouslySetInnerHTML={{__html:html}}/>);
      } catch {result.push(source);}
    }
    end=start+source.length;
  }
  result.push(text.slice(end));return result;
}
/** Split table cells only at real separators, not pipes inside code/math or
 * escaped text. Cells still go through the same escaped inline renderer. */
function tableCells(line:string):string[]|undefined {
  let cell='',code=0,math='',separated=false;const cells:string[]=[];
  for(let i=0;i<line.length;i++){
    const ch=line[i],next=line[i+1];
    if(ch==='\\'&&next){
      if(!code&&next==='('&&!math)math='\\)';
      else if(!code&&math==='\\)'&&next===')')math='';
      cell+=!code&&!math&&next==='|'?'|':ch+next;i++;continue;
    }
    if(ch==='`'&&!math){
      let count=1;while(line[i+count]==='`')count++;
      if(!code)code=count;else if(code===count)code=0;
      cell+='`'.repeat(count);i+=count-1;continue;
    }
    if(ch==='$'&&!code){
      const fence=next==='$'?'$$':'$';
      if(!math)math=fence;else if(math===fence)math='';
      cell+=fence;i+=fence.length-1;continue;
    }
    if(ch==='|'&&!code&&!math){cells.push(cell.trim());cell='';separated=true;}else cell+=ch;
  }
  cells.push(cell.trim());if(!separated)return;
  if(line.trimStart().startsWith('|')&&cells[0]==='')cells.shift();
  if(line.trimEnd().endsWith('|')&&cells.at(-1)==='')cells.pop();
  return cells;
}
export const MathText=memo(function MathText({text}:{text:string}) {
  const parts=useMemo(()=>{
    const result:ReactNode[]=[],lines=text.replace(/\r\n/g,'\n').split('\n');
    let paragraph:string[]=[],mathEnd='';
    const flush=()=>{if(paragraph.length){const key='p'+result.length;result.push(<p key={key}>{inline(paragraph.join('\n'),key)}</p>);paragraph=[];}};
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(mathEnd){paragraph.push(line);if(line.includes(mathEnd))mathEnd='';continue;}
      if(/^\s*```/.test(line)){
        flush();const code:string[]=[];
        while(++i<lines.length&&!/^\s*```/.test(lines[i]))code.push(lines[i]);
        result.push(<pre key={'code'+i}><code>{code.join('\n')}</code></pre>);continue;
      }
      const heading=line.match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
      if(heading){flush();result.push(createElement('h'+heading[1].length,{key:'heading'+i},inline(heading[2],'heading'+i)));continue;}
      const headers=tableCells(line),separator=tableCells(lines[i+1]??'');
      if(headers?.length&&separator?.length===headers.length&&separator.every(cell=>/^:?-{3,}:?$/.test(cell))){
        flush();const key='table'+i,rows:string[][]=[];
        const alignment=separator.map(cell=>cell.startsWith(':')&&cell.endsWith(':')?'center' as const:cell.endsWith(':')?'right' as const:'left' as const);
        i++;
        while(i+1<lines.length){
          const row=tableCells(lines[i+1]);if(!row||row.length>headers.length)break;
          rows.push(row);i++;
        }
        result.push(<div className="math-table-wrap" key={key}><table><thead><tr>{headers.map((cell,col)=><th scope="col" key={col} style={{textAlign:alignment[col]}}>{inline(cell,key+'h'+col)}</th>)}</tr></thead><tbody>{rows.map((row,r)=><tr key={r}>{headers.map((_,col)=><td key={col} style={{textAlign:alignment[col]}}>{inline(row[col]??'',key+'r'+r+'c'+col)}</td>)}</tr>)}</tbody></table></div>);continue;
      }
      const list=line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
      if(list){
        flush();const ordered=!!list[2],items:ReactNode[]=[];let current=list;
        do {items.push(<li key={i}>{inline(current[3],'li'+i)}</li>);const next=lines[i+1]?.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);if(!next||!!next[2]!==ordered)break;current=next;i++;}while(i<lines.length);
        result.push(ordered?<ol key={'list'+i} start={Number(list[2])}>{items}</ol>:<ul key={'list'+i}>{items}</ul>);continue;
      }
      if(!line.trim()){flush();continue;}
      const trimmed=line.trim();
      if(trimmed==='$$')mathEnd='$$';else if(trimmed==='\\[')mathEnd='\\]';
      paragraph.push(line);
    }
    flush();return result;
  },[text]);
  return <div className="math-text">{parts}</div>;
});
