import {$,$$,btn,ibtn,esc,icon,opt,pack,unpack} from './comun.mjs';
import {literalRanges,fold} from '../busqueda.mjs';
import {keyOf,uid} from '../personal.mjs';
const rowId=(b,c,v)=>'v-'+b+'-'+c+'-'+v;
function navigation(A,b,c,delta){
  const book=A.byId.get(b);
  const i=book.chapters.findIndex(x=>x.n===c);
  if(book.chapters[i+delta]) return [b,book.chapters[i+delta].n];
  const next=A.corpus.books[A.corpus.books.indexOf(book)+delta];
  const chapter=next?.chapters[delta>0?0:next.chapters.length-1];
  return chapter?[next.id,chapter.n]:null;
}
function localMatches(A) {
  const result=[];
  const query=A.readerTerm?.trim();
  if(!query) return result;
  for(const [id,n] of A.readerList){
    const chapter=A.byId.get(id).chapters.find(c=>c.n===n);
    for(const v of chapter.verses) for(const [start,end] of literalRanges(v.t,query)){
      result.push({start:{b:id,c:n,v:v.n,o:start},end:{b:id,c:n,v:v.n,o:end}});
    }
  }
  return result;
}
function chapterHTML(A,id,n,focus){
  const book=A.byId.get(id),chapter=book.chapters.find(c=>c.n===n);
  const painted=A.data.prefs.showHighlights?A.data.items.filter(i=>i.color).map(i=>({id:i.id,anchor:i.anchor,color:i.color})):[];
  const headings=chapter.headings||[], show=A.data.prefs.headings;
  function titles(before) {return show?headings.filter(h=>h.before===before).map(h=>`<h3 class="biblical-heading">${esc(h.t)}</h3>`).join(''):'';}
  return `<section class="chapter" data-book="${esc(id)}" data-chapter="${n}"><header class="chapter-head"><p>${esc(book.name)}</p><h2>${id==='salmos'?'SALMO':'Capítulo'} ${n}</h2><div class="tiny-rule"></div></header>
    ${chapter.verses.map(v=>{
      const found=A.readerTerm?literalRanges(v.t,A.readerTerm).map(([o,e])=>({id:'busqueda',color:'#eac981',anchor:{start:{b:id,c:n,v:v.n,o},end:{b:id,c:n,v:v.n,o:e}}})):[];
      const marks=painted.concat(found);
      return titles(v.n)+`<p class="verse" id="${rowId(id,n,v.n)}" data-b="${esc(id)}" data-c="${n}" data-v="${v.n}"><button class="verse-num" data-act="verse-tools" data-b="${esc(id)}" data-c="${n}" data-v="${v.n}" aria-label="Herramientas del versículo ${v.n}">${v.n}</button>${A.F.render(id,n,v.n,{highlights:marks,focus})}</p>`;
    }).join('')}
    ${show?headings.filter(h=>!chapter.verses.some(v=>v.n===h.before)).map(h=>`<h3 class="biblical-heading">${esc(h.t)}</h3>`).join(''):''}
    <footer class="source-line">${btn('Página '+chapter.p+' del PDF','pdf-page','pagina','quiet',`data-page="${chapter.p}"`)}</footer></section>`;
}
function nextArea(A){
  const current=A.readerList.at(-1),next=navigation(A,...current,1);
  if(!next) return '<p class="end-note">Fin de los libros de esta edición.</p>';
  const name=A.byId.get(next[0]).name+' '+next[1];
  return A.data.prefs.scrolling==='continuo'?btn('Continuar con '+name,'append-chapter','libro','btn soft'):
    btn('Siguiente capítulo · '+name,'read-direct','flecha','btn soft',`data-b="${next[0]}" data-c="${next[1]}"`);
}
function observeEnd(A){
  A.readerObserver?.disconnect();
  const end=$('#reader-end');
  if(!end || A.data.prefs.scrolling!=='continuo' || !('IntersectionObserver' in window))return;
  const observer=new IntersectionObserver(entries=>{
    if(entries[0].isIntersecting && A.hasReaderScrolled && !getSelection()?.toString()) {
      A.hasReaderScrolled=false;appendChapter(A);
    }
  },{rootMargin:'0px 0px 180px 0px'});
  observer.observe(end);A.readerObserver=observer;
}
function appendChapter(A){
  if(!$('#reader-text'))return;
  const next=navigation(A,...A.readerList.at(-1),1);
  if(!next)return;
  A.readerList.push(next);
  $('#reader-text').insertAdjacentHTML('beforeend',chapterHTML(A,...next,A.readerFocus));
  $('#reader-end').innerHTML=nextArea(A);
  observeEnd(A);
}
export function visibleVerse(A) {
  if(!$('#reader-text'))return null;
  const cutoff=($('.read-toolbar')?.getBoundingClientRect().bottom||0)+14;
  const node=$$('.verse',$('#reader-text')).find(v=>v.getBoundingClientRect().bottom>cutoff);
  if(!node)return null;
  const {b,c,v}=node.dataset;
  return {anchor:A.F.whole(b,+c,+v),offset:node.getBoundingClientRect().top};
}
export function renderReader(A,parts,same) {
  let target,book,chapter,restore=null;
  if(parts[0]==='pasaje'){target=unpack(parts[1]);if(!A.F.validate(target))return A.missing();}
  if(parts[0]==='continuar'&&A.data.prefs.rememberPosition)restore=A.data.last;
  if(target||restore){const pt=(target||restore.anchor).start;book=A.byId.get(pt.b);chapter=book?.chapters.find(c=>c.n===pt.c);}
  else {
    book=parts[1]?A.byId.get(decodeURIComponent(parts[1])):A.corpus.books[0];
    chapter=book?.chapters.find(c=>c.n===(parts[2]?+parts[2]:book?.chapters[0].n));
    if(parts[3]&&chapter){ target=A.F.whole(book.id,chapter.n,+parts[3]);if(!target)return A.missing();}
  }
  if(!book||!chapter)return A.missing();
  if(!same||!A.readerList?.length){
    A.readerList=[[book.id,chapter.n]];
    if(target){
      const last=target.end;
      let at=A.readerList[0];
      while((at[0]!==last.b||at[1]!==last.c)&&A.readerList.length<6){
        at=navigation(A,...at,1);if(!at)break;A.readerList.push(at);
      }
    }
    A.readerFocus=target;A.readerTerm='';A.matchIndex=0;A.hasReaderScrolled=false;
  }
  const prev=navigation(A,book.id,chapter.n,-1);
  const p=A.data.prefs;
  A.main.innerHTML=`<div class="reading-layout ${p.hideControls?'auto-controls':''}">
  <div class="read-toolbar">
    ${btn(book.name+' · '+chapter.n,'jump-chapter','libro','chapter-jump')}
    <div class="toolbar-icons">${ibtn('Buscar en el capítulo','find-chapter','buscar')+ibtn('Añadir marcador','bookmark-visible','marca')+ibtn('Ajustes de lectura','reader-settings','ajustes')+ibtn('Ocultar o mostrar controles','focus-reader','foco')}</div>
  </div>
  <div id="find-line" class="find-line" ${A.readerTerm?'':'hidden'}><label>En el capítulo<input id="chapter-query" type="search" value="${esc(A.readerTerm)}" autocomplete="off"></label>
  ${btn('Buscar','find-run','buscar','btn soft')+ibtn('Coincidencia siguiente','find-next','flecha')}<span id="find-count" aria-live="polite"></span></div>
  ${target && (A.readerList.at(-1)[0]!==target.end.b||A.readerList.at(-1)[1]!==target.end.c)?btn('Ir al final de la selección','context-anchor','marca','quiet','data-a="'+pack(A.F.whole(target.end.b,target.end.c,target.end.v))+'"'):''}
  <article id="reader-text" class="reader-text">${A.readerList.map(pair=>chapterHTML(A,...pair,A.readerFocus)).join('')}</article>
  <div id="reader-end" class="reader-end">${nextArea(A)}</div>
  <div class="reader-foot">${prev?btn('Capítulo anterior','read-direct','atras','quiet',`data-b="${prev[0]}" data-c="${prev[1]}"`):''}${btn('Índice de libros','books','libro','quiet')}</div></div>
  <button type="button" class="focus-return" data-act="focus-reader">${icon('control')} Mostrar controles</button>`;
  observeEnd(A);
  if(!same){
    const anchor=target||restore?.anchor||A.F.whole(book.id,chapter.n,chapter.verses[0].n);
    A.record(anchor,restore?.offset??110);
    requestAnimationFrame(()=>{
      if(!$('#reader-text'))return;
      if(target){A.F.focus($('#reader-text'),target); setTimeout(()=>{if(A.readerFocus===target)A.readerFocus=null;},4300);}
      else if(restore){
        const {b,c,v}=restore.anchor.start,node=document.getElementById(rowId(b,c,v));
        if(node)window.scrollBy({top:node.getBoundingClientRect().top-Math.min(restore.offset??110,innerHeight*.55),behavior:'instant'});
      }
    });
  }
}
export function renderBooks(A,parts) {
  const id=parts[1]&&decodeURIComponent(parts[1]), selected=A.byId.get(id);
  if(id&&!selected)return A.missing();
  if(selected) {
    A.main.innerHTML=`<section class="page"><a class="crumb" href="#libros">${icon('atras')} Todos los libros</a><div class="page-heading"><div><p class="eyebrow">${selected.group==='AT'?'Antiguo Testamento':'Nuevo Testamento'}</p><h1>${esc(selected.name)}</h1></div></div><div class="line-actions">${btn('Portada e introducción','pdf-page','pagina','quiet',`data-page="${selected.p}"`)}${selected.notesPage?btn('Notas del libro','pdf-page','nota','quiet',`data-page="${selected.notesPage}"`):''}</div><h2>Capítulos</h2><div class="chapter-grid">${selected.chapters.map(c=>`<a href="#leer/${selected.id}/${c.n}" aria-label="Capítulo ${c.n}">${c.n}</a>`).join('')}</div></section>`;return;
  }
  const counts=g=>A.corpus.books.filter(b=>b.group===g);
  A.main.innerHTML=`<section class="page"><div class="page-heading"><div><p class="eyebrow">Índice de la edición</p><h1>Libros</h1></div>${btn('Documento original','original','pagina','btn soft')}</div>
  <label class="book-filter">${icon('buscar')}<input type="search" id="book-filter" aria-label="Filtrar libros" placeholder="Encuentra un libro" autocomplete="off"></label>
  ${['AT','NT'].map(g=>`<section class="book-group"><h2>${g==='AT'?'Antiguo Testamento':'Nuevo Testamento'}</h2><div class="books">${counts(g).map(b=>`<a href="#libros/${esc(b.id)}" data-book-name="${esc(fold(b.name))}"><strong>${esc(b.name)}</strong><span>${b.chapters.length} ${b.chapters.length===1?'capítulo':'capítulos'}</span>${icon('flecha')}</a>`).join('')}</div></section>`).join('')}<p id="empty-books" hidden>Sin libros con ese nombre.</p></section>`;
  $('#book-filter').oninput=e=>{
    const s=fold(e.target.value);let count=0;
    $$('[data-book-name]').forEach(x=>{x.hidden=!x.dataset.bookName.includes(s);if(!x.hidden)count++;});
    $$('.book-group').forEach(g=>g.hidden=!g.querySelector('[data-book-name]:not([hidden])'));$('#empty-books').hidden=count>0;
  };
}
export function readerActions(A){
  const selection=()=>{
    const root=$('#reader-text');if(!root)return null;
    return A.F.readSelection(root);
  };
  const updateBar=()=>{
    const bar=$('#seleccion'),s=selection();
    if(s){A.selection=s;bar.hidden=false;bar.innerHTML=btn('Subrayar','quick-paint','pluma','sel-btn')+btn('Guardar','quick-save','marca','sel-btn')+btn('Más','quick-more','puntos','sel-btn');}
    else if(!$('#panel').open){A.selection=null;bar.hidden=true;}
  };
  document.addEventListener('selectionchange',()=>{clearTimeout(A.selTimer);A.selTimer=setTimeout(updateBar,90);});
  $('#seleccion').addEventListener('pointerdown',e=>e.preventDefault());
  document.addEventListener('copy',e=>{
    const a=selection();if(!a||!e.clipboardData)return;
    e.clipboardData.setData('text/plain',A.F.slice(a));e.preventDefault();
  });
  let scrollTimer,previousY=0;
  window.addEventListener('scroll',()=>{
    if(!$('#reader-text'))return;
    A.hasReaderScrolled=true;
    const now=scrollY;
    if(A.data.prefs.hideControls&&Math.abs(now-previousY)>8)document.body.classList.toggle('scrolling-down',now>previousY&&now>110);
    previousY=now;clearTimeout(scrollTimer);
    scrollTimer=setTimeout(()=>{const current=visibleVerse(A);if(current)A.record(current.anchor,current.offset);},350);
  },{passive:true});
  Object.assign(A.actions,{
    'read-direct':el=>A.go('leer/'+el.dataset.b+'/'+el.dataset.c),
    'verse-tools':el=>{const a=A.F.whole(el.dataset.b,+el.dataset.c,+el.dataset.v);A.record(a,el.getBoundingClientRect().top);A.tools(a);},
    'append-chapter':()=>appendChapter(A),
    'focus-reader':()=>document.body.classList.toggle('reader-focus'),
    'reader-settings':()=>A.go('ajustes/lectura'),
    'quick-more':()=>A.selection&&A.tools(A.selection),
    'quick-save':()=>A.selection&&A.tools(A.selection,'guardar'),
    'quick-paint':()=>A.selection&&A.paint(A.selection,A.data.prefs.defaultColor),
    'jump-chapter':()=>{
      const here=visibleVerse(A)?.anchor.start||{b:A.readerList[0][0],c:A.readerList[0][1]};
      const bookOptions=Object.fromEntries(A.corpus.books.map(b=>[b.id,b.name]));
      A.dialog('Ir a un capítulo',`<div class="form-grid"><label>Libro<select id="jump-book">${opt(bookOptions,here.b)}</select></label><label>Capítulo<select id="jump-num"></select></label></div>${btn('Abrir capítulo','jump-open','libro','btn primary')}`);
      const update=()=>{$('#jump-num').innerHTML=opt(Object.fromEntries(A.byId.get($('#jump-book').value).chapters.map(x=>[x.n,x.n])),here.c);};
      $('#jump-book').onchange=update;update();
    },
    'jump-open':()=>A.go('leer/'+$('#jump-book').value+'/'+$('#jump-num').value,true),
    'bookmark-visible':async()=>{
      const a=visibleVerse(A)?.anchor;if(a)await A.addBookmark(a);
    },
    'find-chapter':()=>{const line=$('#find-line');line.hidden=!line.hidden;if(!line.hidden){$('#chapter-query').focus();$('#chapter-query').onkeydown=e=>{if(e.key==='Enter')A.actions['find-run']();};}
      else if(A.readerTerm){A.readerTerm='';A.refreshKeep();}},
    'find-run':()=>{const term=$('#chapter-query').value.trim();A.readerTerm=term;A.matchIndex=0;A.refreshKeep();$('#find-line').hidden=false;const hits=localMatches(A);$('#find-count').textContent=hits.length+' coincidencias';if(hits.length)A.F.focus($('#reader-text'),hits[0]);},
    'find-next':()=>{const hits=localMatches(A);if(!hits.length)return;A.matchIndex=(A.matchIndex+1)%hits.length;$('#find-count').textContent=(A.matchIndex+1)+' de '+hits.length;A.F.focus($('#reader-text'),hits[A.matchIndex]);}
  });
  A.addBookmark=async a=>{
    const k=keyOf(a);let added=true;
    await A.update(d=>{if(d.bookmarks.some(x=>keyOf(x.anchor)===k)){added=false;return;}d.bookmarks.unshift({id:uid(),anchor:a,date:new Date().toISOString()});});
    A.toast(added?'Marcador guardado en '+A.F.reference(a):'Ya tienes un marcador aquí.');
  };
}

