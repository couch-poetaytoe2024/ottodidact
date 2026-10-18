import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MathText } from '../src/components/MathText';
import { MessageList } from '../src/features/chat/MessageList';
describe('safe explanation formatting',()=>{
  it('renders paragraphs, lists, equations and code without truncation',()=>{
    const text='First paragraph.\n\nSecond paragraph.\n\n1. Use **factoring**.\n2. Set each factor to zero.\n\n$$\nx^2-5x+6=0\n$$\n\n```python\nif x < 3:\n    print(x)\n```';
    const html=renderToStaticMarkup(<MathText text={text}/>);
    expect(html).toContain('<ol');expect(html).toContain('<strong>factoring</strong>');expect(html).toContain('katex-display');expect(html).toContain('<pre><code>');expect(html).toContain('if x &lt; 3:');expect(html).toContain('Second paragraph.');
  });
  it('keeps HTML and fenced code inert',()=>{
    const html=renderToStaticMarkup(<MathText text={'<img src=x onerror=alert(1)>\n\n```html\n<script>evil()</script>\n$$not math$$\n```\n\n`<b>literal</b>`'}/>);
    expect(html).not.toContain('<img');expect(html).not.toContain('<script>');expect(html).not.toContain('katex');expect(html).toContain('&lt;script&gt;');expect(html).toContain('$$not math$$');
  });
  it('renders useful headings and comparison tables in both initial and streamed answers',()=>{
    const text='## Why the vertex is a **maximum**\n\nThe graph opens downward.\n\n| Side | Change |\n| :--- | ---: |\n| Before vertex | **Rises** |\n| After vertex | Falls, $a<0$ |';
    const initial=renderToStaticMarkup(<MathText text={text}/>);
    const streamed=renderToStaticMarkup(<MessageList messages={[]} pendingText={text}/>);
    for(const html of [initial,streamed]){
      expect(html).toContain('<h2>Why the vertex is a <strong>maximum</strong></h2>');
      expect(html).toContain('<table>');expect(html.match(/<th scope=/g)).toHaveLength(2);expect(html.match(/<td /g)).toHaveLength(4);
      expect(html).toContain('text-align:right');expect(html).toContain('katex');
      expect(html).not.toContain('##');expect(html).not.toContain('---:');expect(html).not.toContain('**Rises**');
    }
    expect(streamed).toContain(initial);
  });
  it('keeps code, escaped pipes and absolute-value math inside the correct table cells',()=>{
    const text='| Feature | Meaning |\n| --- | --- |\n| `a | b` | code |\n| $|x|$ | magnitude |\n| \\( |y| \\) | another magnitude |\n| a\\|b | escaped pipe |';
    const html=renderToStaticMarkup(<MathText text={text}/>);
    expect(html.match(/<td /g)).toHaveLength(8);expect(html).toContain('<code>a | b</code>');expect(html).toContain('a|b');expect(html).toContain('katex');
  });
  it('escapes heading/table HTML and keeps source intact through partial streaming prefixes',()=>{
    const text='### <img src=x onerror=evil()>\n\n| Value | Meaning |\n| --- | --- |\n| <script>evil()</script> | **plain** |';
    for(let i=1;i<=text.length;i++){
      const html=renderToStaticMarkup(<MathText text={text.slice(0,i)}/>);
      expect(html).not.toContain('<img');expect(html).not.toContain('<script>');
    }
    const html=renderToStaticMarkup(<MathText text={text}/>);
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');expect(html).toContain('<strong>plain</strong>');
  });
});
