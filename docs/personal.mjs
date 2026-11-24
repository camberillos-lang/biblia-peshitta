export const modes = {libro:'Libro',capitulo:'Capítulo',versiculo:'Versículo',palabras:'Palabras o frases',referencia:'Referencia bíblica',favoritos:'Mis favoritos',subrayados:'Mis subrayados',colecciones:'Mis colecciones'};
export const themes = {auto:'Automático',claro:'Claro',oscuro:'Oscuro',sepia:'Sepia',minimalista:'Minimalista'};
export const colors = ['#f3d16a','#a6d5ad','#9ac9ed','#efaac0','#f2b27b','#c7b0e5'];
export const colorNames = ['Amarillo','Verde','Azul','Rosa','Naranja','Morado'];
export const decoration = {libro:'Libro',hoja:'Hoja',estrella:'Estrella',corazon:'Corazón',sol:'Sol',carpeta:'Carpeta',etiqueta:'Etiqueta',pluma:'Pluma'};
export const sourceDefaults = {scope:'all', books:[], collections:[], favor:false, high:false, mix:false};
export function preferences() {
  return {
    libraryView:'tarjetas', theme:'auto', accent:'#21644f', font:'editorial', size:22, line:1.65, margin:20, density:'amplia', motion:true,
    numbers:true, headings:true, rememberPosition:true, scrolling:'continuo', hideControls:false, confirmSelection:true,
    defaultMode:'libro', rememberMode:true, suggestions:true, typos:true, approx:true, order:'relevance', pageSize:24, searchHistory:true,
    palette:[...colors], defaultColor:colors[0], showHighlights:true, highlightsOrder:'recientes', confirmDelete:true, copyFormat:'despues',
    random:{...sourceDefaults}, noticeSource:{...sourceDefaults}, noticeLength:160, noRepeat:60,
    schedule:{timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', days:[0,1,2,3,4,5,6],count:1,start:'09:00',end:'19:00',mode:'fixed',minInterval:60,quiet:true,quietStart:'22:00',quietEnd:'07:00',special:false}
  };
}
export function blank() { return {version:1, prefs:preferences(), items:[], collections:[], bookmarks:[], history:[], queries:[], last:null, lastMode:'libro'}; }
const hex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const list = a => Array.isArray(a);
export const uid = () => crypto.randomUUID();
export const keyOf = a => [a.start.b,a.start.c,a.start.v,a.start.o,a.end.b,a.end.c,a.end.v,a.end.o].join('|');
export function upsertItem(data,anchor,fragments,source) {
  const key = keyOf(anchor);
  let record = data.items.find(i => keyOf(i.anchor) === key);
  if (!record) {
    record = {id:uid(),source,anchor,text:fragments.slice(anchor),reference:fragments.reference(anchor),created:new Date().toISOString(),saved:false,favorite:false,color:null,note:''};
    data.items.push(record);
  }
  record.updated = new Date().toISOString();
  return record;
}
export function prune(data) {
  const used = new Set(data.collections.flatMap(c => c.items));
  data.items = data.items.filter(i => i.saved || i.favorite || i.color || i.note || used.has(i.id));
}
export function deleteItem(data,id) {
  data.items = data.items.filter(i=>i.id!==id);
  for (const c of data.collections) c.items = c.items.filter(x=>x!==id);
}
export function reorder(values,idx,delta) {
  if(idx<0 || idx+delta<0 || idx+delta>=values.length) return;
  const [value] = values.splice(idx,1);
  values.splice(idx+delta,0,value);
}
export function exportBackup(data,source,part='todo') {
  let items = data.items;
  let collections = data.collections;
  if(part!=='todo') {
    const inCollections = new Set(collections.flatMap(c=>c.items));
    const include = i => ({favoritos:i.favorite,subrayados:!!i.color,notas:!!i.note,colecciones:inCollections.has(i.id),fragmentos:true}[part]);
    items = items.filter(include);
    const ids = new Set(items.map(i=>i.id));
    collections = collections.map(c=>({...c,items:c.items.filter(id=>ids.has(id))})).filter(c=>c.items.length||part==='colecciones');
  }
  const memberships = new Map();
  for (const c of collections) for (const id of c.items) {
    if(!memberships.has(id)) memberships.set(id,[]);
    memberships.get(id).push(c.id);
  }
  const payload = {items:items.map(i=>({...i,collections:memberships.get(i.id)||[]})),collections};
  if(part==='todo') Object.assign(payload,{prefs:data.prefs,bookmarks:data.bookmarks,history:data.history,queries:data.queries,last:data.last,lastMode:data.lastMode});
  return {app:'Biblia Peshitta',format:1,source,part,date:new Date().toISOString(),data:payload};
}
function cleanSource(s) {
  const pick = o => Array.isArray(o) ? o.filter(x=>typeof x==='string' && x.length<180) : [];
  return {scope:['all','AT','NT','books','stored','favorites','highlights','collections'].includes(s?.scope)?s.scope:'all',books:pick(s?.books),collections:pick(s?.collections),favor:s?.favor===true,high:s?.high===true,mix:s?.mix===true};
}
function cleanPrefs(p={}) {
  const base = preferences();
  if (!p || typeof p!=='object') return base;
  const names = {libraryView:['tarjetas','lista'],theme:Object.keys(themes),font:['editorial','clasica','sans','sistema'],density:['amplia','compacta'],scrolling:['continuo','capitulo'],defaultMode:Object.keys(modes),order:['relevance','biblical'],highlightsOrder:['recientes','antiguos','biblico'],copyFormat:['despues','antes','texto']};
  for(const [key,values] of Object.entries(names)) if(values.includes(p[key])) base[key]=p[key];
  for(const key of Object.keys(base)) if(typeof base[key]==='boolean' && typeof p[key]==='boolean') base[key]=p[key];
  for(const [key,min,max] of [['size',16,36],['line',1.2,2.3],['margin',8,56],['pageSize',5,100],['noticeLength',20,500],['noRepeat',0,500]]) {
    if(Number.isFinite(p[key]) && p[key]>=min && p[key]<=max) base[key]=p[key];
  }
  for(const key of ['accent','defaultColor']) if(hex(p[key])) base[key]=p[key];
  if(list(p.palette)&&p.palette.length===6&&p.palette.every(hex)) base.palette=p.palette;
  base.random=cleanSource(p.random); base.noticeSource=cleanSource(p.noticeSource);
  if(p.schedule&&typeof p.schedule==='object') {
    const s=p.schedule;
    const time=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
    for(const k of ['start','end','quietStart','quietEnd']) if(time(s[k])) base.schedule[k]=s[k];
    for(const k of ['quiet','special']) if(typeof s[k]==='boolean') base.schedule[k]=s[k];
    if(['fixed','random'].includes(s.mode)) base.schedule.mode=s.mode;
    if(Number.isInteger(s.count)&&s.count>=1&&s.count<=48) base.schedule.count=s.count;
    if(Number.isInteger(s.minInterval)&&s.minInterval>=1&&s.minInterval<=1440) base.schedule.minInterval=s.minInterval;
    if(list(s.days)&&s.days.length&&s.days.every(n=>Number.isInteger(n)&&n>=0&&n<=6)) base.schedule.days=[...new Set(s.days)];
    if(list(s.times)&&s.times.length===s.count&&s.times.every(time)) base.schedule.times=s.times;
    if(typeof s.timezone==='string') { try {new Intl.DateTimeFormat('es',{timeZone:s.timezone});base.schedule.timezone=s.timezone;}catch{} }
  }
  return base;
}
export function restoreBackup(current, file, source, F, replace=false) {
  const fail=()=>{throw Error('El respaldo contiene referencias o datos incompatibles. No se importó ningún cambio.');};
  if(file?.app!=='Biblia Peshitta' || file.format!==1 || file.source!==source) throw Error('Este respaldo corresponde a otra edición o formato.');
  const src=file.data;
  if(!src||!list(src.items)||!list(src.collections)) fail();
  const validId=x=>typeof x==='string'&&/^[\w-]{1,128}$/.test(x);
  const validDate=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
  const ids=new Set(), cids=new Set();
  const incoming=src.items.map(i=>{
    if(!i||!validId(i.id)||ids.has(i.id)||i.source!==source||!F.validate(i.anchor)||F.slice(i.anchor)!==i.text||!validDate(i.created)||!validDate(i.updated)||typeof i.note!=='string'||(i.color!==null&&!hex(i.color))) fail();
    ids.add(i.id);
    return {id:i.id,source,anchor:i.anchor,text:i.text,reference:F.reference(i.anchor),created:i.created,updated:i.updated,saved:!!i.saved,favorite:!!i.favorite,note:i.note,color:i.color};
  });
  const collections=src.collections.map(c=>{
    if(!c||!validId(c.id)||cids.has(c.id)||typeof c.name!=='string'||!c.name.trim()||!hex(c.color)||!Object.hasOwn(decoration,c.icon)||typeof c.description!=='string'||!list(c.items)||!c.items.every(id=>ids.has(id))||new Set(c.items).size!==c.items.length) fail();
    cids.add(c.id);
    return {id:c.id,name:c.name.trim(),color:c.color,icon:c.icon,description:c.description,items:[...c.items]};
  });
  if(src.bookmarks!==undefined&&(!list(src.bookmarks)||!src.bookmarks.every(x=>validId(x?.id)&&F.validate(x.anchor)&&validDate(x.date)))) fail();
  if(src.history!==undefined&&(!list(src.history)||!src.history.every(x=>F.validate(x?.anchor)&&validDate(x.date)))) fail();
  if(src.last && (!F.validate(src.last.anchor)||!Number.isFinite(src.last.offset||0))) fail();
  if(src.queries!==undefined&&(!list(src.queries)||!src.queries.every(x=>typeof x==='string'))) fail();
  if(replace&&file.part!=='todo') throw Error('Para reemplazar toda la biblioteca, selecciona un respaldo completo.');
  const out=replace?blank():structuredClone(current);
  const mapped=new Map();
  for(const i of incoming){
    const same=out.items.find(x=>keyOf(x.anchor)===keyOf(i.anchor));
    if(same) {
      mapped.set(i.id,same.id);
      same.favorite ||= i.favorite; same.saved ||= i.saved;
      if(i.updated>=same.updated) {same.color=i.color||same.color;same.note=i.note||same.note;same.updated=i.updated;}
    } else {
      const id=out.items.some(x=>x.id===i.id)?uid():i.id;
      mapped.set(i.id,id);out.items.push({...i,id});
    }
  }
  for(const c of collections){
    const old=out.collections.find(x=>x.id===c.id);
    const members=c.items.map(i=>mapped.get(i));
    if(old) old.items=[...new Set([...old.items,...members])];
    else out.collections.push({...c,items:members});
  }
  if(src.bookmarks) for(const m of src.bookmarks) if(!out.bookmarks.some(x=>keyOf(x.anchor)===keyOf(m.anchor))) out.bookmarks.push({id:out.bookmarks.some(x=>x.id===m.id)?uid():m.id,anchor:m.anchor,date:m.date});
  if(src.history) out.history=[...out.history,...src.history].sort((a,b)=>b.date.localeCompare(a.date)).filter((x,i,a)=>a.findIndex(y=>keyOf(x.anchor)===keyOf(y.anchor))===i).slice(0,120);
  if(replace){out.prefs=cleanPrefs(src.prefs);out.queries=(src.queries||[]).slice(0,60);out.last=src.last||null;out.lastMode=Object.hasOwn(modes,src.lastMode)?src.lastMode:'libro';}
  return out;
}
