import {enIPhoneNativo,actualizarIPhone,alAbrirIPhone} from './iphone.mjs';
import {read,change,databaseName} from './almacen.mjs';
import {blank,keyOf} from './personal.mjs';
import {importEdition} from './edicion.mjs';
import {createFragments} from './fragmentos.mjs';
import {createSearch} from './busqueda.mjs';
import {dayVerse,choosePassage,previewText,today} from './azar.mjs';
import {pushState} from './notificar.mjs';
import {$,$$,btn,ibtn,esc,icon,pack,unpack,opt,dateLabel} from './interfaz/comun.mjs';
import {renderReader,renderBooks,readerActions} from './interfaz/lector.mjs';
import {renderSearch,homeSearch,bindHomeSearch,searchActions} from './interfaz/buscar.mjs';
import {renderLibrary,libraryActions} from './interfaz/biblioteca.mjs';
import {renderSettings,settingsActions} from './interfaz/ajustes.mjs';

const A={main:$('#contenido'),actions:{},data:blank(),ready:false,offline:false,prev:'',selection:null,counter:0};
const channels='BroadcastChannel' in window?new BroadcastChannel(databaseName+'-personal'):null;
const navItems=[['inicio','Inicio','home'],['libros','Libros','libro'],['buscar','Buscar','buscar'],['biblioteca','Biblioteca','coleccion']];
function toast(msg,undo=null) {
  const box=$('#mensaje');box.textContent=msg;A.undo=undo;
  if(undo){const b=document.createElement('button');b.type='button';b.dataset.act='undo';b.textContent='Deshacer';box.append(b);}
  box.classList.add('show');clearTimeout(A.toastTimer);
  A.toastTimer=setTimeout(()=>{box.classList.remove('show');A.undo=null;},undo?8000:4400);
}
A.toast=toast;
A.error=err=>toast(err?.message||'No se pudo completar esta acción.');
A.dialog=(title,body)=>{
  const dlg=$('#panel');$('#panel-body').innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>${ibtn('Cerrar','close','cerrar')}</div>${body}`;
  if(!dlg.open)dlg.showModal();dlg.scrollTop=0;$('#seleccion').hidden=true;
};
A.close=()=>{if($('#panel').open)$('#panel').close();};
A.clearSelection=()=>{window.getSelection()?.removeAllRanges();A.selection=null;$('#seleccion').hidden=true;};
A.update=async fn=>{
  A.data=await change('usuario','datos',current=>{const data=current||blank();fn(data);return data;});
  channels?.postMessage('datos');actualizarIPhone(A);
  return A.data;
};
channels?.addEventListener('message',async e=>{
  if(e.data!=='datos')return;A.data=await read('usuario','datos')||blank();applyPrefs();
  if(!$('#panel').open&&!A.selection&&['biblioteca','coleccion'].includes(A.screen))A.refreshKeep();
});
function applyPrefs(){
  const p=A.data.prefs,html=document.documentElement;
  const actual=p.theme==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'oscuro':'claro'):p.theme;
  html.dataset.theme=actual;html.dataset.density=p.density;html.dataset.numbers=String(p.numbers);html.dataset.motion=String(p.motion);
  const ff={editorial:'"Peshitta Serif", Georgia, serif',clasica:'Georgia, "Times New Roman", serif',sans:'"Peshitta Sans", Arial, sans-serif',sistema:'system-ui, sans-serif'};
  for(const [k,v] of Object.entries({'--accent-user':p.accent,'--font-reading':ff[p.font]||ff.editorial,'--reading-size':p.size+'px','--reading-line':p.line,'--reading-margin':p.margin+'px'}))html.style.setProperty(k,v);
  $('meta[name=theme-color]').content=actual==='oscuro'?'#17211e':actual==='sepia'?'#f4e9d1':'#fafaf7';
}
A.apply=applyPrefs;
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',applyPrefs);
const currentPath=()=>location.hash.slice(1)||'inicio';
function navigate(path,approved=false){
  if(A.selection&&A.data.prefs.confirmSelection&&!approved&&!confirm('¿Salir sin guardar la selección?'))return;
  A.close();A.clearSelection();A.approvedPath=path;
  if(path===currentPath()){draw(false);return;}
  location.hash=path;
}
A.go=navigate;
A.context=a=>{if(A.F?.validate(a))navigate('pasaje/'+pack(a),true);};
A.refreshKeep=()=>{
  const y=scrollY;
  draw(true);window.scrollTo({top:y,behavior:'instant'});
};
A.missing=()=>{A.main.innerHTML=`<section class="page empty"><h1>Ubicación no disponible</h1><p>Revisa la referencia en el índice de esta edición.</p><a class="btn primary" href="#libros">Abrir libros</a></section>`;};
A.record=(a,offset=96)=>{
  if(!a||!A.F?.validate(a))return;
  const last=A.data.last;
  if(A.data.prefs.rememberPosition&&last&&keyOf(a)===keyOf(last.anchor)&&Math.abs(last.offset-offset)<4&&A.data.history[0]?.anchor?.start.v===a.start.v)return;
  A.update(d=>{
    if(d.prefs.rememberPosition)d.last={anchor:a,offset:Math.round(offset)};
    const same=x=>x.anchor.start.b===a.start.b&&x.anchor.start.c===a.start.c&&x.anchor.start.v===a.start.v;
    if(!d.history[0]||!same(d.history[0])){
      d.history=d.history.filter(x=>!same(x));d.history.unshift({anchor:a,date:new Date().toISOString()});d.history=d.history.slice(0,120);
    }
  }).catch(A.error);
};
A.rememberQuery=q=>{
  if(!A.data.prefs.searchHistory||!q.trim())return;
  A.update(d=>{d.queries=[q.trim(),...d.queries.filter(x=>x!==q.trim())].slice(0,60);}).catch(A.error);
};
function prepare(corpus){
  A.corpus=corpus;A.hash=corpus.source.sha256;A.F=createFragments(corpus);A.engine=createSearch(corpus);
  A.byId=new Map(corpus.books.map(b=>[b.id,b]));A.bookOrder=new Map(corpus.books.map((b,i)=>[b.id,i]));
  A.counts={chapters:0,verses:0};
  for(const b of corpus.books){A.counts.chapters+=b.chapters.length;for(const c of b.chapters)A.counts.verses+=c.verses.length;}
}
const pending=new Map();
A.wordQuery=(query,options)=>{
  if(!('Worker'in window)||A.workerFailed)return Promise.resolve(A.engine.words(query,options));
  try{
    if(!A.worker){
      const wk=new Worker(new URL('./buscar-worker.mjs',import.meta.url),{type:'module'});
      A.worker=wk;
      wk.onmessage=e=>{const m=pending.get(e.data.id);if(m){pending.delete(e.data.id);e.data.error?m.reject(Error(e.data.error)):m.resolve(e.data.result);}};
      wk.onerror=()=>{A.workerFailed=true;wk.terminate();for(const [id,m] of pending){m.resolve(A.engine.words(m.query,m.options));pending.delete(id);}};
      const books=A.corpus.books.map(b=>({id:b.id,name:b.name,abbr:b.abbr,group:b.group,chapters:b.chapters.map(c=>({n:c.n,headings:c.headings,verses:c.verses.map(({n,t,p})=>({n,t,p}))}))}));
      wk.postMessage({type:'init',corpus:{books}});
    }
    return new Promise((resolve,reject)=>{const id=++A.counter;pending.set(id,{resolve,reject,query,options});A.worker.postMessage({type:'words',id,query,options});});
  }catch{A.workerFailed=true;return Promise.resolve(A.engine.words(query,options));}
};
function nav(screen){
  const active=['leer','pasaje','continuar','original'].includes(screen)?'libros':screen==='coleccion'?'biblioteca':screen;
  const make=(mobile=false)=>navItems.map(([key,label,ico])=>`<a href="#${key}" ${key===active?'class="selected" aria-current="page"':''}>${icon(ico)}<span>${label}</span></a>`).join('');
  $('#cabecera').innerHTML=`<div class="top-inner"><a href="#inicio" class="brand" aria-label="Biblia Peshitta, inicio"><img src="./assets/icon-180.png" width="40" height="40" alt=""><span>Biblia <em>Peshitta</em></span></a><nav class="desktop-nav" aria-label="Navegación principal">${make()}</nav><a class="top-settings ${active==='ajustes'?'selected':''}" href="#ajustes" aria-label="Ajustes">${icon('ajustes')}<span>Ajustes</span></a></div>`;
  $('#movil').innerHTML=make(true);
}
function setupView(){
  A.main.innerHTML=`<section class="page intro">
    <div class="hero onboarding"><img class="wheat" src="./assets/espigas.webp" alt=""><div class="hero-content"><p class="hero-label">${icon('libro')} Edición personal</p><h1>Abre tu Biblia Peshitta</h1><p class="intro-copy">Importa la edición del paquete para leer, subrayar y guardar tus pasajes en este dispositivo.</p>
    <label class="btn gold file-button">${icon('subir')} Importar mi edición<input type="file" id="edition-file"></label><p id="edition-progress" role="status" class="progress"></p></div></div>
    <section class="first-help"><h2>Primera instalación</h2><ol><li>Descomprime el paquete que descargaste.</li><li>Abre la app desde el ícono de tu pantalla de inicio.</li><li>Selecciona <strong>Mi-edicion.peshitta</strong>. Una sola importación prepara este dispositivo para leer sin conexión.</li></ol></section></section>`;
  $('#edition-file').onchange=async e=>{
    const input=e.target,file=input.files[0];if(!file)return;
    input.disabled=true;const status=$('#edition-progress');
    try{
      const c=await importEdition(file,msg=>{status.textContent=msg;});prepare(c);
      alAbrirIPhone(A).catch(A.error);navigator.storage?.persist?.().catch(()=>{});A.prev='';draw(false);toast('Edición lista. Ya puedes empezar a leer.');
    }catch(err){status.textContent=err.message;input.disabled=false;input.value='';}
  };
}
function art(){return '<img class="wheat" src="./assets/espigas.webp" alt="">';}
function todayLabel(){return new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'}).format(new Date());}
function home(){
  const a=dayVerse(A.corpus,A.F),t=A.F.slice(a),preview=previewText(t,270),first=A.corpus.books[0],last=A.data.prefs.rememberPosition?A.data.last:null;
  const recent=A.data.history.slice(0,3);
  const quick=(key,label,ico,n)=>`<a class="quick-tile" href="#biblioteca/${key}"><span class="tile-icon">${icon(ico)}</span><strong>${label}</strong><span>${n.toLocaleString('es-MX')}</span>${icon('flecha')}</a>`;
  A.main.innerHTML=`<section class="page home"><div class="page-heading welcome"><div><p class="eyebrow today">${esc(todayLabel())}</p><h1>Mi lectura</h1></div><a href="#historial" class="quiet history-link">${icon('reloj')} Historial</a></div>
  <div class="home-grid"><article class="hero">${art()}<div class="hero-content"><p class="hero-label">${icon('sol')} Versículo del día</p><p class="hero-verse">${esc(preview)}</p>
  <p class="hero-reference">${esc(A.F.reference(a))}</p><div class="hero-actions">${btn('Ver contexto completo','context-anchor','libro','btn gold',`data-a="${pack(a)}"`)+ibtn('Herramientas del versículo del día','tools-anchor','puntos',`data-a="${pack(a)}"`)}</div></div></article>
  <aside class="continue-card"><span class="round-icon">${icon('marca')}</span><div><p class="eyebrow">${last?'Continuar leyendo':'Comenzar a leer'}</p><h2>${esc(last?A.F.locate(last.anchor.start).book.name:first.name)}</h2><p>${last?'Capítulo '+last.anchor.start.c+' · Versículo '+last.anchor.start.v:'Capítulo '+first.chapters[0].n}</p></div><a class="btn primary" href="#continuar">${icon('libro')} Abrir lector</a><a class="quiet" href="#libros">Explorar libros y capítulos</a></aside></div>
  <div class="search-heading"><h2>Encontrar un pasaje</h2></div>${homeSearch(A)}
  <div class="home-lower"><section><div class="section-title"><h2>Mi biblioteca</h2><a href="#biblioteca">Ver todo</a></div><div class="quick-tiles">
  ${quick('favoritos','Favoritos','corazon',A.data.items.filter(i=>i.favorite).length)+quick('subrayados','Subrayados','pluma',A.data.items.filter(i=>i.color).length)+quick('colecciones','Colecciones','carpeta',A.data.collections.length)}</div></section>
  <section><div class="section-title"><h2>Descubrir</h2></div><div class="discover">${btn('Sorpréndeme','random','azar','discover-btn')}<a href="#original/1">${icon('pagina')} Documento original</a><a href="#marcadores">${icon('marca')} Mis marcadores</a></div></section></div>
  ${recent.length?`<section class="recent-section"><div class="section-title"><h2>Lecturas recientes</h2><a href="#historial">Ver historial</a></div><div class="chips">${recent.map(r=>btn(A.F.reference(r.anchor),'context-anchor','reloj','chip',`data-a="${pack(r.anchor)}"`)).join('')}</div></section>`:''}</section>`;
  bindHomeSearch(A);
}
function passageView(a,kind){
  if(!A.F.validate(a))return A.missing();
  const random=kind==='azar';
  A.main.innerHTML=`<section class="page narrow"><div class="page-heading"><div><p class="eyebrow">Biblia Peshitta</p><h1>${random?'Sorpréndeme':'Tu recordatorio'}</h1></div></div>
  <article class="hero passage">${art()}<div class="hero-content"><p class="hero-label">${icon(random?'azar':'campana')} ${esc(A.F.reference(a))}</p><p class="hero-verse">${esc(A.F.slice(a))}</p>
  <div class="hero-actions">${btn('VER CONTEXTO COMPLETO','context-anchor','libro','btn gold',`data-a="${pack(a)}"`)}</div></div></article>
  <div class="line-actions stand">${random?btn('Obtener otro versículo','random','azar','btn primary'):''}
  ${btn('Favorito','fav-anchor','corazon','btn soft',`data-a="${pack(a)}"`)+btn('Guardar y subrayar','tools-anchor','pluma','btn soft',`data-a="${pack(a)}"`)}${random?'<a class="quiet" href="#ajustes/azar">Origen de los textos</a>':''}</div></section>`;
}
function logs(type){
  const history=type==='historial',list=history?A.data.history:A.data.bookmarks;
  A.main.innerHTML=`<section class="page narrow"><div class="page-heading"><div><p class="eyebrow">Mi lectura</p><h1>${history?'Historial de lectura':'Mis marcadores'}</h1></div>${history&&list.length?btn('Limpiar historial','clear-history','papelera','quiet'):''}</div>
  ${list.map(i=>`<article class="record-row"><div>${btn(A.F.reference(i.anchor),'context-anchor',history?'reloj':'marca','quiet',`data-a="${pack(i.anchor)}"`)}<small>${dateLabel(i.date)}</small></div>${history?'':ibtn('Quitar marcador','drop-bookmark','cerrar',`data-id="${i.id}"`)}</article>`).join('')||`<div class="empty">${icon(history?'reloj':'marca')}<p>${history?'Tus lecturas aparecerán aquí.':'Toca el marcador en el lector para guardar una ubicación.'}</p></div>`}</section>`;
}
async function original(parts){
  const page=Math.max(1,Math.min(A.corpus.source.pages,Number(parts[1])||1));
  const sections=A.corpus.sections.map(s=>`<option value="${s.p}">${esc(s.name)} · p. ${s.p}</option>`).join('');
  A.main.innerHTML=`<section class="page"><div class="page-heading"><div><p class="eyebrow">Edición íntegra</p><h1>Documento original</h1></div></div>
  <label class="pdf-index">Índice del documento<select id="pdf-sections"><option value="">Ir a una sección…</option>${sections}</select></label><div id="pdf-container" aria-live="polite"><p>Abriendo la página original…</p></div></section>`;
  const container=$('#pdf-container');
  const [{mountFacsimile},pdf,pagesIndex]=await Promise.all([import('./facsimil/viewer.mjs'),read('edicion','pdf'),read('edicion','pages')]);
  if(!container.isConnected)return;
  if(!pdf)throw Error('Falta la copia local del PDF. Vuelve a importar tu edición.');
  const viewer=mountFacsimile(container,{pdf,page,pagesIndex,onPageChange:n=>{
    if(A.screen==='original'){const path='original/'+n;history.replaceState(null,'','#'+path);A.prev=path;}
  }});
  A.viewer=viewer;$('#pdf-sections').onchange=e=>{if(e.target.value)viewer.goTo(+e.target.value);};
  await viewer.ready;
  if(A.pdfQuery&&container.isConnected){const q=A.pdfQuery;A.pdfQuery=null;await viewer.find(q);}
}
function draw(refresh=false){
  if(!A.ready)return;
  const path=currentPath(),parts=path.split('/'),screen=parts[0],same=refresh&&A.prev===path;
  if(!same){A.clearSelection();A.close();A.libLimit=40;A.bulk=false;A.chosen.clear();A.filters=null;window.scrollTo({top:0,behavior:'instant'});document.body.classList.remove('reader-focus','scrolling-down');}
  if(A.screen==='original'){A.viewer?.destroy();A.viewer=null;}
  A.readerObserver?.disconnect();A.prev=path;A.screen=screen;nav(screen);applyPrefs();
  if(!A.corpus){setupView();return;}
  try{
    if(screen==='inicio')home();
    else if(screen==='libros')renderBooks(A,parts);
    else if(['leer','pasaje','continuar'].includes(screen))renderReader(A,parts,same);
    else if(screen==='buscar')renderSearch(A);
    else if(['biblioteca','coleccion'].includes(screen))renderLibrary(A,parts);
    else if(screen==='ajustes')renderSettings(A,parts);
    else if(screen==='original')original(parts).catch(A.error);
    else if(screen==='azar'||screen==='aviso')passageView(unpack(parts[1]),screen);
    else if(['historial','marcadores'].includes(screen))logs(screen);
    else A.missing();
  }catch(err){A.error(err);A.main.innerHTML=`<div class="page empty"><h2>No se pudo abrir esta vista</h2><p>${esc(err.message)}</p><a href="#inicio" class="btn primary">Volver al inicio</a></div>`;}
  const heading=A.main.querySelector('h1,h2');document.title=(heading?heading.textContent+' · ':'')+'Biblia Peshitta';
}
Object.assign(A.actions,{
  undo:async()=>{const undo=A.undo;A.undo=null;if(undo)await undo();},
  close:()=>A.close(),books:()=>A.go('libros'),original:()=>A.go('original/1'),
  'pdf-page':el=>A.go('original/'+el.dataset.page,true),
  random:async()=>{
    const prior=(await read('dispositivo','azar-usados'))||[];
    const a=choosePassage(A.corpus,A.F,A.data,A.data.prefs.random,prior);
    if(!a){A.toast('Tu origen de textos está vacío. Elige libros o guarda un fragmento.');A.go('ajustes/azar');return;}
    await change('dispositivo','azar-usados',v=>[...(v||[]),keyOf(a)].slice(-60));A.go('azar/'+pack(a));
  },
  'clear-history':async()=>{if(!confirm('¿Limpiar el historial de lectura?'))return;await A.update(d=>{d.history=[];d.last=null;});A.refreshKeep();toast('Historial eliminado.');},
  'drop-bookmark':async el=>{if(!confirm('¿Quitar este marcador?'))return;await A.update(d=>d.bookmarks=d.bookmarks.filter(x=>x.id!==el.dataset.id));A.refreshKeep();}
});
readerActions(A);libraryActions(A);searchActions(A);settingsActions(A);
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');
  if(el){const handler=A.actions[el.dataset.act];if(handler){e.preventDefault();try{Promise.resolve(handler(el,e)).catch(A.error);}catch(err){A.error(err);}}return;}
  const link=e.target.closest('a[href^="#"]');
  if(link&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey){e.preventDefault();const hash=link.getAttribute('href').slice(1);if(hash==='contenido')A.main.focus();else A.go(hash);}
});
window.addEventListener('hashchange',()=>{
  const path=currentPath();
  if(A.selection&&A.data.prefs.confirmSelection&&A.approvedPath!==path&&!confirm('¿Salir sin guardar la selección?')){history.replaceState(null,'','#'+A.prev);return;}
  A.approvedPath=null;draw(false);
});
document.addEventListener('keydown',e=>{
  if(!A.corpus||$('#panel').open||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(e.key==='/'){e.preventDefault();A.go('buscar');setTimeout(()=>$('#search-query')?.focus(),60);}
  if(e.key==='Escape'&&document.body.classList.contains('reader-focus'))document.body.classList.remove('reader-focus');
});
$('#panel').addEventListener('click',e=>{if(e.target===$('#panel')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)A.close();}});
async function offline(){
  if(enIPhoneNativo()){A.offline=true;const label=$('#offline-edition');if(label)label.textContent='Edición y aplicación listas sin conexión.';return;}
  if(!('serviceWorker'in navigator)||!isSecureContext){A.offlineError=true;return;}
  const check=worker=>{if(!worker)return;const ch=new MessageChannel();ch.port1.onmessage=e=>{A.offline=!!e.data.ready;const el=$('#offline-edition');if(el&&A.offline)el.textContent='Edición y aplicación listas sin conexión.';ch.port1.close();};worker.postMessage('offline-status',[ch.port2]);};
  check(navigator.serviceWorker.controller);
  try {
    const reg=await navigator.serviceWorker.register('./sw.mjs',{type:'module',scope:'./',updateViaCache:'none'});
    await navigator.serviceWorker.ready;
    const worker=reg.active||navigator.serviceWorker.controller;
    check(worker);
  }catch(err){if(navigator.serviceWorker.controller)check(navigator.serviceWorker.controller);else {A.offlineError=true;const el=$('#offline-edition');if(el)el.textContent='La descarga sin conexión está pendiente. Abre de nuevo con internet.';}}
}
navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='abrir-aviso'&&/^#(aviso|pasaje|ajustes)\//.test(e.data.hash))A.go(e.data.hash.slice(1),true);});
window.addEventListener('peshitta-activa',()=>alAbrirIPhone(A).catch(A.error));
async function start(){
  try{
    const [data,corpus,push]=await Promise.all([read('usuario','datos'),read('edicion','corpus'),pushState()]);
    A.data=data||blank();A.push=push;if(corpus)prepare(corpus);A.ready=true;draw();offline();alAbrirIPhone(A).catch(A.error);
  }catch(err){A.main.innerHTML=`<section class="page empty"><h1>Almacenamiento no disponible</h1><p>Abre Biblia Peshitta en una ventana normal y comprueba el espacio disponible.</p><p>${esc(err.message)}</p></section>`;}
}
start();
