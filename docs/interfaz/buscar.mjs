import {$,btn,esc,icon,opt,pack,rings} from './comun.mjs';
import {modes} from '../personal.mjs';
import {fold,literalRanges} from '../busqueda.mjs';
const examples={libro:'Escribe el nombre del libro',capitulo:'Elige un capítulo',versiculo:'Número o intervalo',palabras:'Escribe una palabra o frase',referencia:'Por ejemplo, Jn 3:16',favoritos:'Busca en tus favoritos',subrayados:'Busca en tus subrayados',colecciones:'Nombre de colección o fragmento'};
const inputMode=mode=>!['capitulo','versiculo'].includes(mode);
const sOf=A=>A.searchState||(A.searchState={mode:A.data.prefs.rememberMode?A.data.lastMode:A.data.prefs.defaultMode,q:'',book:A.corpus.books[0].id,chapter:1,verse:'1',filter:'',match:'fragment',order:A.data.prefs.order,page:1,within:'',cross:false});
function categoryOptions(A,mode){return `<label class="scope-label">Buscar por<select id="search-mode">${opt(modes,mode)}</select></label>`;}
function inputText(q,placeholder){return `<label class="search-field">${icon('buscar')}<input id="search-query" type="search" value="${esc(q)}" aria-label="Texto de búsqueda" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="search"></label>`;}
export function homeSearch(A){
  const s=sOf(A);
  return `<form id="home-find" class="search-box">${categoryOptions(A,s.mode)}${inputText('',examples[s.mode])}<button class="btn primary" type="submit">Buscar</button></form>`;
}
export function bindHomeSearch(A){
  const s=sOf(A);
  $('#search-mode').onchange=async e=>{s.mode=e.target.value;s.page=1;s.q='';$('#search-query').placeholder=examples[s.mode];await A.update(d=>d.lastMode=s.mode);
    if(!inputMode(s.mode))A.go('buscar');};
  $('#home-find').onsubmit=e=>{e.preventDefault();s.q=$('#search-query').value;s.page=1;A.go('buscar');if(s.q.trim())A.rememberQuery(s.q);};
}
function bookField(A,s){
  return `<label>Libro<select id="struct-book">${opt(Object.fromEntries(A.corpus.books.map(b=>[b.id,b.name])),s.book)}</select></label>`;
}
function resultsFromItems(A,items,query) {
  return items.map(i=>{
    const ranges=literalRanges(i.text,query);
    return resultCard(A,i.anchor,rings(i.text,ranges),i.reference);
  }).join('');
}
function resultCard(A,anchor,body,ref){
  const value=pack(anchor);
  return `<article class="result-card"><div class="result-title"><strong>${esc(ref)}</strong></div><p class="literal">${body}</p><div class="line-actions">${btn('Ver en contexto','context-anchor','libro','quiet',`data-a="${value}"`)+btn('Herramientas','tools-anchor','puntos','quiet',`data-a="${value}"`)}</div></article>`;
}
function noResults(message='Prueba con una palabra más corta o revisa la categoría.'){
  return `<div class="empty compact"><h3>Sin coincidencias</h3><p>${esc(message)}</p></div>`;
}
function chip(text) {return btn(text,'search-chip','','chip',`data-q="${esc(text)}"`);}
async function results(A,explicit=false) {
  const s=sOf(A),m=s.mode,q=s.q.trim(),p=A.data.prefs,node=$('#search-results');
  if(!node)return;
  const serial=++A.searchSerial;
  if(m==='libro'){
    if(!q){node.innerHTML=`<a class="result-row" href="#libros">${icon('libro')} Explorar todos los libros ${icon('flecha')}</a>`;return;}
    if(!explicit&&!p.suggestions){node.innerHTML='<p class="hint">Pulsa Buscar para ver los libros.</p>';return;}
    const list=A.engine.books(q,{typos:p.typos&&p.approx,limit:66});
    node.innerHTML=list.length?list.map(b=>`<a class="result-row" href="#libros/${esc(b.id)}">${icon('libro')}<strong>${esc(b.name)}</strong><span>${A.byId.get(b.id).chapters.length} capítulos</span>${icon('flecha')}</a>`).join(''):noResults('Prueba una abreviatura o abre el índice de libros.')+'<a class="quiet" href="#libros">Abrir índice</a>';
    return;
  }
  if(m==='referencia'){
    if(!q){node.innerHTML='<p class="hint">Admite capítulo, versículo o intervalo. Por ejemplo, Juan 3 16 y Mateo 5:3-12.</p>';return;}
    const ref=A.engine.reference(q,{typos:p.typos&&p.approx});
    if(!ref){
      const hints=p.suggestions?A.engine.referenceSuggestions(q,{typos:p.typos&&p.approx,limit:6}):[];
      node.innerHTML=noResults('Revisa el libro, el capítulo y los números de versículo.')+hints.map(chip).join('');return;
    }
    if(ref.start===null){
      const b=A.byId.get(ref.book);
      node.innerHTML=`<a class="result-row" href="#leer/${b.id}/${ref.chapter}">${icon('libro')}<strong>${esc(b.name)} ${ref.chapter}</strong><span>Abrir capítulo</span>${icon('flecha')}</a>`;
    }else{
      const a=A.F.whole(ref.book,ref.chapter,ref.start,ref.end);
      node.innerHTML=resultCard(A,a,esc(A.F.slice(a)),A.F.reference(a));
    }return;
  }
  if(!inputMode(m)){
    const b=A.byId.get(s.book),ch=b.chapters.find(c=>c.n===Number(s.chapter));
    if(!ch){node.innerHTML=noResults('Elige un capítulo que figure en el índice.');return;}
    if(m==='capitulo'){node.innerHTML=`<a class="result-row" href="#leer/${b.id}/${ch.n}">${icon('libro')}<strong>${esc(b.name)} ${ch.n}</strong><span>${ch.verses.length} versículos</span>${icon('flecha')}</a>`;return;}
    const match=/^\s*(\d+)(?:\s*[-–—]\s*(\d+))?\s*$/.exec(s.verse);
    const a=match?A.F.whole(b.id,ch.n,+match[1],+(match[2]||match[1])):null;
    node.innerHTML=a?resultCard(A,a,esc(A.F.slice(a)),A.F.reference(a)):noResults('En este capítulo puedes elegir del '+ch.verses[0].n+' al '+ch.verses.at(-1).n+'.');
    return;
  }
  if(['favoritos','subrayados','colecciones'].includes(m)){
    const normalized=fold(q);
    const has=t=>fold(t).includes(normalized);
    const current=A.data.collections.filter(c=>!s.within||c.id===s.within);
    const members=new Set(current.flatMap(c=>c.items));
    const list=A.data.items.filter(i=>(m==='favoritos'?i.favorite:m==='subrayados'?i.color:members.has(i.id))&&(has(i.text)||has(i.reference)));
    const names=m==='colecciones'?current.filter(c=>has(c.name)).map(c=>`<a class="result-row" href="#coleccion/${c.id}">${icon(c.icon)}<strong>${esc(c.name)}</strong><span>${c.items.length} fragmentos</span>${icon('flecha')}</a>`).join(''):'';
    const total=list.length,limit=p.pageSize,page=Math.min(s.page,Math.max(1,Math.ceil(total/limit)));
    node.innerHTML=names+resultsFromItems(A,list.slice((page-1)*limit,page*limit),q)+pager(page,Math.ceil(total/limit))||noResults('Los fragmentos guardados en esta categoría aparecerán aquí.');
    return;
  }
  if(!q){node.innerHTML=p.searchHistory&&A.data.queries.length?'<h3>Búsquedas recientes</h3><div class="chips">'+A.data.queries.slice(0,8).map(chip).join('')+'</div>':'<p class="hint">Escribe una palabra o una frase para consultar el texto bíblico.</p>';return;}
  if(!explicit&&q.length===1){node.innerHTML='<p class="hint">Pulsa Buscar para consultar una sola letra.</p>';return;}
  node.innerHTML='<p class="hint" role="status">Buscando…</p>';
  const response=await A.wordQuery(q,{book:s.filter,mode:s.match,order:s.order,page:s.page,limit:p.pageSize,suggest:p.suggestions,typos:p.typos&&p.approx,crossVerse:s.cross});
  if(serial!==A.searchSerial||!node.isConnected)return;
  const cards=response.items.map(i=>{
    let a,body,ref;
    if(i.parts?.length){
      const first=i.parts[0],last=i.parts.at(-1);
      a={start:{b:i.book,c:i.chapter,v:first.n,o:first.ranges[0][0]},end:{b:i.book,c:i.chapter,v:last.n,o:last.ranges.at(-1)[1]}};
      body=i.parts.map(v=>rings(v.t,v.ranges)).join('\n');
    }else{
      a=A.F.whole(i.book,i.chapter,i.n);
      body=rings(i.t,i.ranges);
    }
    ref=A.F.reference(a);return resultCard(A,a,body,ref);
  }).join('');
  node.innerHTML=(cards?`<p class="result-count">${response.total.toLocaleString('es-MX')} resultados</p>${cards}${pager(response.page,response.pages)}`:noResults()+(response.suggestions.length?'<h3>Tal vez buscabas</h3><div class="chips">'+response.suggestions.map(chip).join('')+'</div>':''))+
    btn('Buscar también en las páginas del PDF','pdf-search','pagina','quiet',`data-q="${esc(q)}"`);
}
function pager(page,pages){if(pages<2)return '';return `<div class="pager">${page>1?btn('Anterior','search-page','atras','btn soft',`data-page="${page-1}"`):''}<span>${page} de ${pages}</span>${page<pages?btn('Siguiente','search-page','flecha','btn soft',`data-page="${page+1}"`):''}</div>`;}
export function renderSearch(A) {
  const s=sOf(A),m=s.mode,b=A.byId.get(s.book);
  const struct=`<div class="form-grid">${bookField(A,s)}<label>Capítulo<input id="struct-ch" type="number" inputmode="numeric" min="1" max="${b.chapters.at(-1).n}" value="${s.chapter}" list="chapter-options"></label><datalist id="chapter-options">${b.chapters.map(c=>`<option value="${c.n}"></option>`).join('')}</datalist>${m==='versiculo'?`<label>Versículo o intervalo<input id="struct-v" value="${esc(s.verse)}" placeholder="3-12"></label>`:''}</div>`;
  A.main.innerHTML=`<section class="page search-page"><div class="page-heading"><div><p class="eyebrow">Explorar la edición</p><h1>Buscar</h1></div></div>
  <form id="search-form"><div class="search-box">${categoryOptions(A,m)}${inputMode(m)?inputText(s.q,examples[m]):''}<button class="btn primary" type="submit">Buscar</button></div>
  ${inputMode(m)?'':struct}
  ${m==='palabras'?`<details class="options-bar" ${s.filter||s.match!=='fragment'||s.cross?'open':''}><summary>Opciones de búsqueda</summary><div class="form-grid"><label>Libro<select id="word-book">${opt({'':'Todos los libros',...Object.fromEntries(A.corpus.books.map(b=>[b.id,b.name]))},s.filter)}</select></label><label>Coincidencia<select id="word-match">${opt({fragment:'Fragmento de palabra',exact:'Palabra exacta',phrase:'Frase completa'},s.match)}</select></label><label>Orden<select id="word-order">${opt({relevance:'Relevancia',biblical:'Orden bíblico'},s.order)}</select></label><label class="check"><input type="checkbox" id="word-cross" ${s.cross?'checked':''}> Incluir frases entre versículos consecutivos</label></div></details>`:''}
  ${m==='colecciones'?`<label class="standalone-field">Colección<select id="search-collection">${opt({'':'Todas las colecciones',...Object.fromEntries(A.data.collections.map(c=>[c.id,c.name]))},s.within)}</select></label>`:''}</form>
  <div id="search-results" class="results" aria-live="polite"></div></section>`;
  const run=(explicit=false)=>results(A,explicit).catch(A.error);
  $('#search-mode').onchange=async e=>{s.mode=e.target.value;s.q='';s.page=1;await A.update(d=>d.lastMode=s.mode);renderSearch(A);};
  if($('#search-query')) $('#search-query').oninput=e=>{s.q=e.target.value;s.page=1;A.searchSerial++;clearTimeout(A.typeTimer);A.typeTimer=setTimeout(()=>run(),170);};
  if($('#struct-book')) $('#struct-book').onchange=e=>{s.book=e.target.value;s.chapter=A.byId.get(s.book).chapters[0].n;s.verse='1';renderSearch(A);};
  if($('#struct-ch'))$('#struct-ch').oninput=e=>{s.chapter=Number(e.target.value);run();};
  if($('#struct-v'))$('#struct-v').oninput=e=>{s.verse=e.target.value;run();};
  for(const [id,key] of [['word-book','filter'],['word-match','match'],['word-order','order'],['search-collection','within']])if($('#'+id))$('#'+id).onchange=e=>{s[key]=e.target.value;s.page=1;run(true);};
  if($('#word-cross'))$('#word-cross').onchange=e=>{s.cross=e.target.checked;s.page=1;run(true);};
  $('#search-form').onsubmit=e=>{e.preventDefault();clearTimeout(A.typeTimer);s.page=1;if(s.q.trim())A.rememberQuery(s.q);run(true);};
  run(true);
}
export function searchActions(A){
  A.searchSerial=0;
  Object.assign(A.actions,{
    'search-chip':el=>{const s=sOf(A);s.q=el.dataset.q;s.page=1;renderSearch(A);},
    'search-page':el=>{sOf(A).page=+el.dataset.page;results(A,true).catch(A.error);$('#search-results').scrollIntoView({block:'start'});},
    'pdf-search':el=>{A.pdfQuery=el.dataset.q;A.go('original/1');}
  });
}

