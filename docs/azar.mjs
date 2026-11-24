import {keyOf,sourceDefaults} from './personal.mjs';
const cache=new WeakMap();
function pool(corpus,F) {
  if(cache.has(corpus)) return cache.get(corpus);
  const anchors=[];
  for(const book of corpus.books) for(const chapter of book.chapters) for(const verse of chapter.verses) {
    if(verse.t.trim() && !verse.unresolved) anchors.push({anchor:F.whole(book.id,chapter.n,verse.n),b:book.id,group:book.group});
  }
  cache.set(corpus,anchors);
  return anchors;
}
export function today(date=new Date()) {
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function hash(s) {
  let n=2166136261;
  for (const ch of s) n=Math.imul(n^ch.charCodeAt(0),16777619);
  return n>>>0;
}
export function dayVerse(corpus,F,day=today()) {
  const candidates=pool(corpus,F);
  return candidates.length?candidates[hash(corpus.source.sha256+'|'+day)%candidates.length].anchor:null;
}
export function choosePassage(corpus,F,data,settings={},recent=[],seed=null) {
  const opt={...sourceDefaults,...settings};
  const books=new Map(corpus.books.map(b=>[b.id,b]));
  const accepts=b=>opt.scope==='books'?opt.books.includes(b):['AT','NT'].includes(opt.scope)?books.get(b)?.group===opt.scope:true;
  const exclusive=['stored','favorites','highlights','collections'].includes(opt.scope);
  const membership=new Set(data.collections.filter(c=>opt.collections.includes(c.id)).flatMap(c=>c.items));
  const sources=data.items.filter(i=>{
    if(!F.validate(i.anchor)) return false;
    const start=books.get(i.anchor.start.b),end=books.get(i.anchor.end.b);
    if(start!==end && (opt.scope==='books'||['AT','NT'].includes(opt.scope))) {
      const a=corpus.books.indexOf(start),b=corpus.books.indexOf(end);
      if(!corpus.books.slice(a,b+1).every(x=>accepts(x.id))) return false;
    }
    return accepts(i.anchor.start.b)&&accepts(i.anchor.end.b);
  });
  let personal=sources.filter(i=>{
    if(opt.scope==='collections') return membership.has(i.id);
    if(opt.scope==='favorites') return i.favorite;
    if(opt.scope==='highlights') return !!i.color;
    return exclusive||opt.mix||(opt.favor&&i.favorite)||(opt.high&&i.color);
  });
  const wanted=personal.filter(i=>(opt.favor&&i.favorite)||(opt.high&&i.color));
  const random=()=>{const n=new Uint32Array(1);crypto.getRandomValues(n);return n[0]/4294967296;};
  const draw=(list,salt)=>list[Math.floor((seed===null?random():hash(seed+'|'+salt)/4294967296)*list.length)];
  let ordinary=exclusive?[]:pool(corpus,F).filter(x=>accepts(x.b)).map(x=>x.anchor);
  const allPersonal=personal.map(i=>i.anchor),allWanted=wanted.map(i=>i.anchor);
  if(!ordinary.length&&!allPersonal.length) return null;
  const blocked=new Set(recent);
  let op=ordinary.filter(a=>!blocked.has(keyOf(a)));
  let pp=allPersonal.filter(a=>!blocked.has(keyOf(a)));
  let priority=allWanted.filter(a=>!blocked.has(keyOf(a)));
  if(!op.length&&!pp.length) {
    const last=new Map(recent.map((k,i)=>[k,i]));
    const candidates=[...ordinary,...allPersonal];
    const oldest=Math.min(...candidates.map(a=>last.get(keyOf(a))??-1));
    return draw(candidates.filter(a=>(last.get(keyOf(a))??-1)===oldest),'oldest');
  }
  const r=seed===null?random():hash(seed+'|pool')/4294967296;
  if(priority.length&&r<0.7) return draw(priority,'priority');
  if(pp.length&&(!op.length||r<0.5)) return draw(pp,'personal');
  return draw(op.length?op:pp,'general');
}
// The preview is always a continuous literal slice and includes no added ellipsis.
export function previewText(text,max) {
  if(text.length<=max) return text;
  let part=text.slice(0,max);
  if(/[\uD800-\uDBFF]$/.test(part)) part=part.slice(0,-1);
  const boundary=part.search(/\s+\S*$/u);
  if(boundary>0 && !/\s/u.test(text[part.length]||'')) part=part.slice(0,boundary);
  return part.trimEnd();
}
export function notifiedAnchor(F,anchor,max) {
  const literal=F.slice(anchor), preview=previewText(literal,max);
  return F.prefix(anchor,preview.length);
}
