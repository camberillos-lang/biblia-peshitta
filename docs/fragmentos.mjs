// Los desplazamientos son unidades UTF-16 dentro de verse.t. El extremo final
// es exclusivo. Títulos, controles y llamadas editoriales viven fuera de t.
const rules = `
  [data-verse-text] { white-space: pre-wrap; overflow-wrap: anywhere }
  [data-verse-text] .fr-italica { font-style: italic }
  [data-verse-text] .fr-versales { font-variant-caps: small-caps }
  [data-verse-text] .fr-roja { color: var(--rojo-editorial, #9c3340) }
  @media (prefers-color-scheme: dark) {
    [data-verse-text] .fr-roja { color: var(--rojo-editorial, #ffadb1) }
  }
  :is([data-theme="dark"],[data-theme="oscuro"]) [data-verse-text] .fr-roja { color: var(--rojo-editorial, #ffadb1) }
  :is([data-theme="light"],[data-theme="claro"],[data-theme="sepia"]) [data-verse-text] .fr-roja { color: var(--rojo-editorial, #9c3340) }
  [data-verse-text] [data-frag-highlight] {
    color: var(--fr-ink); background-color: var(--fr-paint);
    background-image: var(--fr-bands, none); border-radius: .12em;
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
  }
  [data-verse-text] [data-frag-highlight].fr-roja { color: var(--fr-red-ink) }
  [data-verse-text] [data-frag-at] {
    font-size: .63em; line-height: 0; vertical-align: super;
    user-select: none; -webkit-user-select: none;
  }
  [data-verse-text] :is([data-frag-focus],[data-frag-pulse]) {
    border-radius: .12em; box-shadow: inset 0 -.12em 0 var(--linea-contexto, #ba861f);
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
    background-color: var(--fondo-contexto, rgba(225,175,56,.25));
    scroll-margin-block-start: clamp(5rem,18vh,10rem);
  }
  [data-verse-text] [data-frag-focus][data-frag-highlight] { background-color: var(--fr-paint) }
  [data-verse-text] [data-frag-highlight] [data-frag-pulse] { background-color: transparent }
`;

const escapeHTML = value => String(value).replace(/[&<>"']/g, char =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
const key = (b,c,v) => JSON.stringify([b,c,v]);
const integer = n => Number.isSafeInteger(n) && n >= 0;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById('peshitta-estilos-fragmentos')) return;
  const sheet = doc.createElement('style');
  sheet.id = 'peshitta-estilos-fragmentos';
  sheet.textContent = rules;
  doc.head.appendChild(sheet);
}

function validOffset(text, n) {
  if (!integer(n) || n > text.length) return false;
  if (!n || n === text.length) return true;
  // Nunca partir un carácter suplementario por la mitad en un respaldo.
  return !(text.charCodeAt(n-1) >= 0xd800 && text.charCodeAt(n-1) <= 0xdbff &&
           text.charCodeAt(n) >= 0xdc00 && text.charCodeAt(n) <= 0xdfff);
}

function colorSwatch(value) {
  const raw = String(value || '');
  if (/^#[\da-f]{3}$/i.test(raw)) return '#' + [...raw.slice(1)].map(c => c+c).join('');
  return /^#[\da-f]{6}$/i.test(raw) ? raw : '#edcd70';
}

function luminance(hex) {
  const rgb = [1,3,5].map(i => Number.parseInt(hex.slice(i,i+2),16)/255)
    .map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4);
  return .2126*rgb[0] + .7152*rgb[1] + .0722*rgb[2];
}
function contrast(a,b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function bestInk(bg, choices) {
  return choices.reduce((best, next) => contrast(bg,next)>contrast(bg,best) ? next : best);
}
function paint(highlights) {
  const colors = [...new Set(highlights.map(h=>colorSwatch(h.color)).reverse())];
  const main = colors[0];
  let css = '--fr-paint:'+main+';--fr-ink:'+bestInk(main,['#111814','#ffffff','#000000'])+
    ';--fr-red-ink:'+bestInk(main,['#651122','#fff1f1','#32090c']);
  if (colors.length > 1) {
    // El color reciente cubre el cuerpo. Cada subrayado superpuesto conserva
    // una banda inferior reconocible y su identificador editable.
    const bands = [main+' 0% 76%'];
    colors.slice(1).forEach((c,i) => {
      const width = 24/(colors.length-1);
      bands.push(c+' '+(76+i*width).toFixed(3)+'% '+(76+(i+1)*width).toFixed(3)+'%');
    });
    css += ';--fr-bands:linear-gradient(to bottom,'+bands.join(',')+')';
  }
  return css;
}

function wrappers(root) {
  if (!root?.querySelectorAll) return [];
  const found = [...root.querySelectorAll('[data-verse-text]')];
  if (root.matches?.('[data-verse-text]')) found.unshift(root);
  return found;
}
function textNodes(leaf) {
  const nodes = [];
  const walker = leaf.ownerDocument.createTreeWalker(leaf,4); // SHOW_TEXT
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.length) nodes.push(n);
  }
  return nodes;
}
function leafPoint(leaf,offset,bias) {
  const nodes = textNodes(leaf);
  let start = 0;
  for (const node of nodes) {
    const end = start + node.length;
    if (offset < end || (offset === end && bias === 'end')) return [node,offset-start];
    start = end;
  }
  if (!nodes.length || offset !== start) return null;
  const last = nodes[nodes.length-1];
  return [last,last.length];
}

export function createFragments(corpus) {
  const entries = [], positions = new Map(), jobs = new WeakMap();
  const bookIds = new Set();
  for (const book of corpus.books) {
    if (typeof book.id !== 'string' || !book.id) throw new TypeError('Libro sin identificador.');
    if (bookIds.has(book.id)) throw new TypeError('Libro duplicado: '+book.id);
    bookIds.add(book.id);
    const chapters = new Set();
    for (const chapter of book.chapters) {
      if (!integer(chapter.n) || chapters.has(chapter.n)) throw new TypeError('Número de capítulo inválido o duplicado: '+book.id);
      chapters.add(chapter.n);
      for (const verse of chapter.verses) {
        const identity = key(book.id,chapter.n,verse.n);
        if (!integer(verse.n) || typeof verse.t !== 'string')
          throw new TypeError('Registro bíblico sin número o sin texto.');
        if (positions.has(identity)) throw new TypeError('Referencia duplicada: '+identity);
        const entry = {book,chapter,verse,index:entries.length};
        entries.push(entry);
        positions.set(identity,entry);
      }
    }
  }

  function locate(point) {
    if (!point || typeof point.b !== 'string' || !integer(point.c) || !integer(point.v)) return null;
    return positions.get(key(point.b,point.c,point.v)) || null;
  }
  function point(entry,o) {
    return {b:entry.book.id,c:entry.chapter.n,v:entry.verse.n,o};
  }
  function bounds(anchor) {
    if (!anchor?.start || !anchor?.end) return null;
    let first = locate(anchor.start), last = locate(anchor.end);
    if (!first || !last) return null;
    let a = anchor.start.o, z = anchor.end.o;
    if (!validOffset(first.verse.t,a) || !validOffset(last.verse.t,z) || first.index > last.index) return null;
    // Una selección que acaba justo antes del primer carácter del siguiente
    // versículo no le atribuye ninguna palabra a ese versículo.
    while (first.index < last.index && a === first.verse.t.length) {
      first = entries[first.index+1]; a = 0;
    }
    while (first.index < last.index && z === 0) {
      last = entries[last.index-1]; z = last.verse.t.length;
    }
    if (first.index === last.index && a >= z) return null;
    return {first,last,a,z};
  }
  function validate(anchor) { return bounds(anchor) !== null; }
  function canonical(anchor) {
    const range = bounds(anchor);
    return range ? {start:point(range.first,range.a),end:point(range.last,range.z)} : null;
  }
  function whole(b,c,v,endV=v) {
    const first = locate({b,c,v}), last = locate({b,c,v:endV});
    if (!first || !last) return null;
    return canonical({start:point(first,0),end:point(last,last.verse.t.length)});
  }
  function localPart(range, entry) {
    if (!range || entry.index < range.first.index || entry.index > range.last.index) return null;
    const a = entry.index===range.first.index ? range.a : 0;
    const z = entry.index===range.last.index ? range.z : entry.verse.t.length;
    return a < z ? [a,z] : null;
  }
  function part(anchor,b,c,v) {
    const entry = locate({b,c,v});
    return entry ? localPart(bounds(anchor),entry) : null;
  }
  function slice(anchor) {
    const range = bounds(anchor);
    if (!range) return '';
    if (range.first === range.last) return range.first.verse.t.slice(range.a,range.z);
    const pieces = [range.first.verse.t.slice(range.a)];
    for (let n=range.first.index+1; n<range.last.index; n++) pieces.push(entries[n].verse.t);
    pieces.push(range.last.verse.t.slice(0,range.z));
    return pieces.join('\n');
  }
  function prefix(anchor,units) {
    const r=bounds(anchor);
    if(!r || !Number.isInteger(units) || units<1) return null;
    let left=units;
    for(let n=r.first.index;n<=r.last.index;n++){
      const entry=entries[n], from=n===r.first.index?r.a:0, to=n===r.last.index?r.z:entry.verse.t.length;
      if(left<=to-from){
        const end=from+left;
        return canonical({start:point(r.first,r.a),end:point(entry,validOffset(entry.verse.t,end)?end:end-1)});
      }
      left-=to-from+1;
    }
    return canonical(anchor);
  }
  function reference(anchor) {
    const range = bounds(anchor);
    if (!range) return '';
    const {first, last} = range;
    const left = first.book.name+' '+first.chapter.n+':'+first.verse.n;
    if (first===last) return left;
    if (first.book===last.book && first.chapter===last.chapter) return left+'–'+last.verse.n;
    if (first.book===last.book) return left+'–'+last.chapter.n+':'+last.verse.n;
    return left+' – '+last.book.name+' '+last.chapter.n+':'+last.verse.n;
  }
  function intersects(a,b) {
    const x = bounds(a), y = bounds(b);
    if (!x || !y) return false;
    const precedes=(left,right)=>left.last.index<right.first.index ||
      (left.last.index===right.first.index && left.z<=right.a);
    return !precedes(x,y) && !precedes(y,x);
  }

  function render(b,c,v,{highlights=[],focus=null}={}) {
    injectStyle(globalThis.document);
    const entry = locate({b,c,v});
    if (!entry) return '';
    const {verse} = entry, t = verse.t;
    const decorations = [], styles = [], calls = new Map();
    const edges = new Set([0,t.length]);
    for (const h of highlights) {
      const range = localPart(bounds(h?.anchor),entry);
      if (range) {
        decorations.push({a:range[0],z:range[1],id:String(h.id ?? ''),color:h.color});
        edges.add(range[0]); edges.add(range[1]);
      }
    }
    const focused = localPart(bounds(focus),entry);
    if (focused) { edges.add(focused[0]); edges.add(focused[1]); }
    for (const [a,z,flags] of verse.styles || []) {
      if (!validOffset(t,a) || !validOffset(t,z) || a>=z) continue;
      styles.push({a,z,flags:String(flags)});
      edges.add(a); edges.add(z);
    }
    for (const [at,label] of verse.marks || []) {
      if (!validOffset(t,at)) continue;
      if (!calls.has(at)) calls.set(at,[]);
      calls.get(at).push(String(label)); edges.add(at);
    }
    const points = [...edges].sort((a,z)=>a-z);
    let html = '<span data-verse-text="" data-book="'+escapeHTML(b)+'" data-chapter="'+c+
      '" data-verse="'+v+'" data-order="'+entry.index+'">';
    for (let i=0; i<points.length; i++) {
      const a = points[i], z = points[i+1];
      for (const label of calls.get(a) || []) {
        html += '<sup data-frag-at="'+a+'" aria-label="Llamada editorial '+escapeHTML(label)+'">'+
          escapeHTML(label)+'</sup>';
      }
      if (z === undefined) break;
      let attrs = ' data-frag-a="'+a+'" data-frag-z="'+z+'"';
      const flags = styles.filter(s=>s.a<=a && s.z>=z).map(s=>s.flags).join('');
      const classes = [];
      if (flags.includes('i')) classes.push('fr-italica');
      if (flags.includes('r')) classes.push('fr-roja');
      if (flags.includes('s')) classes.push('fr-versales');
      if (classes.length) attrs += ' class="'+classes.join(' ')+'"';
      const active = decorations.filter(h=>h.a<=a && h.z>=z);
      if (active.length) attrs += ' data-frag-highlight="" data-highlight-ids="'+
        escapeHTML(JSON.stringify(active.map(h=>h.id)))+'" style="'+paint(active)+'"';
      if (focused && focused[0]<=a && focused[1]>=z) attrs += ' data-frag-focus=""';
      html += '<span'+attrs+'>'+escapeHTML(t.slice(a,z))+'</span>';
    }
    return html+'</span>';
  }

  function entryOf(el) {
    const {book:b,chapter,verse} = el.dataset;
    return locate({b,c:Number(chapter),v:Number(verse)});
  }
  function readSelection(root, selection=root?.ownerDocument?.defaultView?.getSelection()) {
    if (!selection || selection.rangeCount!==1 || selection.isCollapsed) return null;
    const selected = selection.getRangeAt(0);
    let start = null, end = null, previous = null;
    for (const el of wrappers(root)) {
      if (!selected.intersectsNode(el)) continue;
      const entry = entryOf(el);
      if (!entry) continue;
      for (const leaf of el.querySelectorAll('[data-frag-a]')) {
        if (!selected.intersectsNode(leaf)) continue;
        let at = Number(leaf.dataset.fragA);
        for (const node of textNodes(leaf)) {
          const after = at + node.length;
          if (selected.comparePoint(node,node.length)>=0 && selected.comparePoint(node,0)<=0) {
            const a=at+(selected.startContainer===node ? selected.startOffset : 0);
            const z=at+(selected.endContainer===node ? selected.endOffset : node.length);
            if (a<z) {
              if (previous && previous!==entry && previous.index+1!==entry.index) return null;
              if (!start) start=point(entry,a);
              end=point(entry,z); previous=entry;
            }
          }
          at=after;
        }
      }
    }
    return start && end ? canonical({start,end}) : null;
  }
  function domPoint(el,offset,bias) {
    let last = null;
    for (const leaf of el.querySelectorAll('[data-frag-a]')) {
      const a=Number(leaf.dataset.fragA), z=Number(leaf.dataset.fragZ);
      if (a<=offset && (offset<z || (bias==='end' && offset===z))) return leafPoint(leaf,offset-a,bias);
      last=leaf;
    }
    return last && offset===Number(last.dataset.fragZ) ?
      leafPoint(last,offset-Number(last.dataset.fragA),bias) : null;
  }
  function toRange(root,anchor) {
    const range=bounds(anchor);
    if (!range) return null;
    let expected=range.first.index, start=null, end=null;
    for (const el of wrappers(root)) {
      const entry=entryOf(el);
      if (!entry || entry.index<range.first.index || entry.index>range.last.index) continue;
      if (entry.index!==expected) return null;
      expected++;
      if (entry===range.first) start=domPoint(el,range.a,'start');
      if (entry===range.last) end=domPoint(el,range.z,'end');
    }
    if (!start || !end) return null;
    const dom=start[0].ownerDocument.createRange();
    dom.setStart(...start); dom.setEnd(...end);
    return dom;
  }
  function clearFocus(root) {
    const timer=jobs.get(root);
    if (timer) { clearTimeout(timer); jobs.delete(root); }
    root.querySelectorAll('[data-frag-focus]').forEach(el=>el.removeAttribute('data-frag-focus'));
    root.querySelectorAll('[data-frag-pulse]').forEach(el=>{
      const parent=el.parentNode;
      el.replaceWith(...el.childNodes);
      parent.normalize();
    });
  }
  function focus(root,anchor,{duration=4200,scroll=true}={}) {
    const range=bounds(anchor);
    if (!root?.querySelectorAll || !range) return false;
    injectStyle(root.ownerDocument);
    clearFocus(root);
    let first=null;
    for (const el of wrappers(root)) {
      const entry=entryOf(el);
      const selected=entry && localPart(range,entry);
      if (!selected) continue;
      for (const leaf of el.querySelectorAll('[data-frag-a]')) {
        let at=Number(leaf.dataset.fragA);
        if (at>=selected[1] || Number(leaf.dataset.fragZ)<=selected[0]) continue;
        for (const node of textNodes(leaf)) {
          const length=node.length;
          const a=Math.max(0,selected[0]-at), z=Math.min(length,selected[1]-at);
          if (a<z) {
            if (z<length) node.splitText(z);
            const inside=a ? node.splitText(a) : node;
            const mark=el.ownerDocument.createElement('span');
            mark.dataset.fragPulse='';
            inside.replaceWith(mark); mark.appendChild(inside);
            if (!first) first=mark;
          }
          at+=length;
        }
      }
    }
    if (!first) return false;
    if (scroll) first.scrollIntoView?.({block:'start',inline:'nearest',behavior:'auto'});
    if (duration>0) jobs.set(root,setTimeout(()=>clearFocus(root),duration));
    return true;
  }
  return {locate,whole,validate,canonical,slice,prefix,reference,part,intersects,render,readSelection,toRange,focus,clearFocus};
}
