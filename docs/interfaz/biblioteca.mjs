import {enIPhoneNativo,llamada} from '../iphone.mjs';
import {$,$$,btn,ibtn,esc,icon,opt,pack,unpack,stamp,dateLabel,copyText} from './comun.mjs';
import {decoration,uid,keyOf,upsertItem,prune,deleteItem,reorder,colorNames} from '../personal.mjs';
import {fold} from '../busqueda.mjs';
const tabs={favoritos:'Favoritos',subrayados:'Subrayados',fragmentos:'Fragmentos',colecciones:'Colecciones',notas:'Notas'};
const own=(A,a)=>A.data.items.find(i=>keyOf(i.anchor)===keyOf(a));
const attr=(a)=>`data-a="${pack(a)}"`;
const mem=(d,id)=>d.collections.filter(c=>c.items.includes(id));
function card(A,i,section,editable=false){
  const memberships=mem(A.data,i.id);
  return `<article class="library-card" ${i.color?`style="--stripe:${esc(i.color)}"`:''}><div class="result-title">
  ${A.bulk?`<label class="check"><input type="checkbox" data-bulk="${i.id}" ${A.chosen.has(i.id)?'checked':''}>Seleccionar</label>`:''}<strong>${esc(i.reference)}</strong>
  ${ibtn('Herramientas del fragmento','tools-anchor','puntos',attr(i.anchor))}</div>
  <p class="literal">${esc(i.text)}</p>${i.note?`<div class="personal-note"><small>Nota personal</small><p>${esc(i.note)}</p></div>`:''}
  <div class="card-meta">${memberships.map(c=>`<span>${icon(c.icon)} ${esc(c.name)}</span>`).join('')}<time>${dateLabel(i.created)}</time></div>
  <div class="line-actions">${btn('Ver en contexto','context-anchor','libro','quiet',attr(i.anchor))}
  ${editable?ibtn('Subir fragmento','member-up','orden',`data-id="${i.id}"`)+ibtn('Bajar fragmento','member-down','abajo',`data-id="${i.id}"`)+ibtn('Quitar de esta colección','member-remove','cerrar',`data-id="${i.id}"`):''}</div></article>`;
}
function colCard(A,c){
  return `<article class="col-card" style="--col:${esc(c.color)}"><a href="#coleccion/${c.id}"><span class="collection-icon">${icon(c.icon)}</span><div><h3>${esc(c.name)}</h3><p>${c.items.length} ${c.items.length===1?'fragmento':'fragmentos'}</p>${c.description?`<small>${esc(c.description)}</small>`:''}</div></a><div class="col-controls">${ibtn('Editar colección','collection-edit','ajustes',`data-id="${c.id}"`)+ibtn('Subir colección','collection-up','orden',`data-id="${c.id}"`)+ibtn('Bajar colección','collection-down','abajo',`data-id="${c.id}"`)}</div></article>`;
}
function toolsPanel(A,a,section=''){
  if(!A.F?.validate(a))return A.error(Error('La selección ya no está disponible.'));
  A.toolAnchor=A.F.canonical(a);
  a=A.toolAnchor;
  const record=own(A,a),ref=A.F.reference(a),t=A.F.slice(a),p=A.data.prefs;
  const highlights=A.data.items.filter(i=>i.color&&A.F.intersects(a,i.anchor)&&(!record||i.id!==record.id));
  const colors=p.palette.map((c,j)=>`<button class="swatch ${record?.color===c?'chosen':''}" type="button" style="--swatch:${esc(c)}" aria-label="Subrayar con color ${colorNames[j]}" title="${colorNames[j]}" data-act="paint-color" data-color="${esc(c)}"></button>`).join('');
  if(section==='guardar'||section==='colecciones'){
    const chosen=new Set(record?mem(A.data,record.id).map(c=>c.id):[]);
    const checks=A.data.collections.map(c=>`<label class="check"><input type="checkbox" class="member-choice" value="${c.id}" ${chosen.has(c.id)?'checked':''}>${icon(c.icon)} ${esc(c.name)}</label>`).join('');
    A.dialog(section==='guardar'?'Guardar fragmento':'Añadir a colección',`<p class="ref">${esc(ref)}</p><blockquote class="selection-preview">${esc(t)}</blockquote><fieldset><legend>Colecciones</legend>${checks||'<p class="hint">Puedes guardar el fragmento directamente o crear su primera colección.</p>'}<label>Nueva colección<input id="inline-collection" maxlength="120" placeholder="Nombre opcional"></label></fieldset>${btn('Guardar fragmento','save-members','marca','btn primary')}`);
    return;
  }
  if(section==='nota'){
    A.dialog('Nota personal',`<p class="ref">${esc(ref)}</p><blockquote class="selection-preview">${esc(t)}</blockquote><label>Tu nota<textarea id="item-note" rows="5">${esc(record?.note||'')}</textarea></label><div class="dialog-actions">${btn('Guardar nota','note-save','nota','btn primary')}</div>`);return;
  }
  A.dialog(ref,`<blockquote class="selection-preview">${esc(t)}</blockquote>
  <div class="label-line"><strong>Subrayar</strong>${record?.color?btn('Quitar color','remove-color','','quiet'):''}</div><div class="swatches">${colors}</div>
  ${highlights.length?`<details class="options-bar"><summary>Subrayados dentro de esta selección (${highlights.length})</summary>${highlights.map(i=>btn(i.text.slice(0,80),'tools-anchor','pluma','action-line',attr(i.anchor))).join('')}</details>`:''}
  <div class="tool-grid">
  ${btn(record?.favorite?'Quitar de favoritos':'Guardar en favoritos','toggle-fav','corazon','tool')+
    btn('Guardar fragmento','tool-save','marca','tool')+btn('Añadir a colección','tool-collections','carpeta','tool')+
    btn(record?.note?'Editar nota personal':'Añadir nota personal','tool-note','nota','tool')+
    btn('Copiar','copy','copiar','tool')+btn('Compartir','share','compartir','tool')+
    btn('Poner marcador','tool-bookmark','marca','tool')+btn('Página original','source-anchor','pagina','tool')}
  </div><div class="dialog-actions">${btn('Ver contexto completo','context-anchor','libro','btn primary',attr(a))}
  ${record?btn('Eliminar fragmento','delete-item','papelera','quiet danger',`data-id="${record.id}"`):''}</div>`);
}
function newCollection(name){return {id:uid(),name,description:'',icon:'carpeta',color:'#38745e',items:[]};}
function editCollection(A,id){
  const c=A.data.collections.find(x=>x.id===id)||newCollection('');
  A.editCollection=id||'';
  A.dialog(id?'Editar colección':'Nueva colección',`<form id="collection-form">
  <label>Nombre<input required maxlength="120" id="col-name" value="${esc(c.name)}" placeholder="Nombre de tu colección"></label>
  <div class="form-grid"><label>Ícono<select id="col-icon">${opt(decoration,c.icon)}</select></label><label>Color<input type="color" id="col-color" value="${esc(c.color)}"></label></div>
  <label>Descripción personal<textarea rows="3" maxlength="2000" id="col-desc">${esc(c.description)}</textarea></label>
  <div class="dialog-actions"><button type="submit" class="btn primary">Guardar colección</button>${id?btn('Eliminar colección','collection-delete','papelera','quiet danger',`data-id="${id}"`):''}</div></form>`);
  $('#collection-form').onsubmit=async e=>{
    e.preventDefault();const name=$('#col-name').value.trim();if(!name)return;
    const fields={name,icon:$('#col-icon').value,color:$('#col-color').value,description:$('#col-desc').value};
    await A.update(d=>{if(id){const old=d.collections.find(x=>x.id===id);if(old)Object.assign(old,fields);}else d.collections.push({...newCollection(name),...fields});});
    A.close();A.refreshKeep();A.toast('Colección guardada.');
  };
}
export function renderLibrary(A,parts){
  const detail=parts[0]==='coleccion',tab=detail?'colecciones':Object.hasOwn(tabs,parts[1])?parts[1]:'favoritos';
  const coll=detail?A.data.collections.find(c=>c.id===parts[1]):null;
  if(detail&&!coll)return A.missing();
  A.currentCol=coll?.id||'';
  const f=A.filters||(A.filters={q:'',book:'',color:'',date:'',collection:''});
  let list=coll?coll.items.map(id=>A.data.items.find(i=>i.id===id)).filter(Boolean):A.data.items.filter(i=>({favoritos:i.favorite,subrayados:!!i.color,fragmentos:true,notas:!!i.note}[tab]));
  const normalized=fold(f.q);
  const wanted=f.collection&&A.data.collections.find(c=>c.id===f.collection);
  const keep=i=>(!normalized||fold(i.text+' '+i.reference+' '+i.note).includes(normalized))&&(!f.book||(A.bookOrder.get(i.anchor.start.b)<=A.bookOrder.get(f.book)&&A.bookOrder.get(f.book)<=A.bookOrder.get(i.anchor.end.b)))&&(!f.color||i.color===f.color)&&(!f.date||new Date(i.created).toLocaleDateString('en-CA')===new Date(f.date+'T12:00:00').toLocaleDateString('en-CA'))&&(!wanted||wanted.items.includes(i.id));
  list=list.filter(keep);
  if(!coll) {
    if(tab==='subrayados'&&A.data.prefs.highlightsOrder==='biblico')list.sort((a,b)=>A.F.locate(a.anchor.start).index-A.F.locate(b.anchor.start).index||a.anchor.start.o-b.anchor.start.o);
    else list.sort((a,b)=>(a.created.localeCompare(b.created))*(tab==='subrayados'&&A.data.prefs.highlightsOrder==='antiguos'?1:-1));
  }
  const showCollections=!coll&&tab==='colecciones',filteredCollections=A.data.collections.filter(c=>fold(c.name+' '+c.description).includes(normalized));
  const itemsCount=showCollections?filteredCollections.length:list.length;
  const limit=A.libLimit||40,view=A.data.prefs.libraryView||'tarjetas';
  A.main.innerHTML=`<section class="page">${coll?'<a href="#biblioteca/colecciones" class="crumb">'+icon('atras')+' Colecciones</a>':''}
  <div class="page-heading"><div><p class="eyebrow">${coll?'Colección personal':'Lecturas guardadas'}</p><h1>${esc(coll?coll.name:'Mi biblioteca')}</h1>${coll?.description?`<p class="muted">${esc(coll.description)}</p>`:''}</div>
  ${coll?btn('Editar','collection-edit','ajustes','btn soft',`data-id="${coll.id}"`):btn('Nueva colección','collection-new','mas','btn soft')}</div>
  ${coll?'':`<nav class="tabs" aria-label="Biblioteca">${Object.entries(tabs).map(([key,label])=>`<a href="#biblioteca/${key}" class="${tab===key?'selected':''}">${label}</a>`).join('')}</nav>`}
  <div class="filter-head"><label class="book-filter">${icon('buscar')}<input id="lib-q" type="search" aria-label="Buscar en esta vista" placeholder="${coll?'Buscar en esta colección':'Buscar en esta vista'}" value="${esc(f.q)}"></label>
  ${showCollections?'':ibtn(view==='tarjetas'?'Vista de lista':'Vista de tarjetas','switch-view',view==='tarjetas'?'lista':'cuadricula')+ibtn('Seleccionar varios fragmentos','bulk-mode','ok')}</div>
  ${showCollections?'':`<details class="options-bar" ${A.libFilters?'open':''} id="lib-filters"><summary>Filtros</summary><div class="form-grid">
  <label>Libro<select id="lib-book">${opt({'':'Todos',...Object.fromEntries(A.corpus.books.map(b=>[b.id,b.name]))},f.book)}</select></label>
  <label>Color<select id="lib-color">${opt({'':'Todos',...Object.fromEntries([...new Set([...A.data.prefs.palette,...A.data.items.map(i=>i.color).filter(Boolean)])].map(c=>[c,colorNames[A.data.prefs.palette.indexOf(c)]||c]))},f.color)}</select></label>
  <label>Fecha de guardado<input type="date" id="lib-date" value="${esc(f.date)}"></label><label>Colección<select id="lib-collection">${opt({'':'Todas',...Object.fromEntries(A.data.collections.map(c=>[c.id,c.name]))},f.collection)}</select></label></div></details>`}
  ${A.bulk&&!showCollections?`<div class="line-actions">${btn('Organizar selección','bulk-organize','carpeta','btn soft')+btn('Terminar selección','bulk-mode','','quiet')}</div>`:''}
  <div class="library-layout ${view==='lista'?'as-list':''}">${showCollections?filteredCollections.slice(0,limit).map(c=>colCard(A,c)).join(''):list.slice(0,limit).map(i=>card(A,i,tab,detail)).join('')}</div>
  ${itemsCount===0?`<div class="empty">${icon(showCollections?'carpeta':tab==='favoritos'?'corazon':'libro')}<h3>${normalized||f.book||f.color||f.date||f.collection?'Sin coincidencias':showCollections?'Tu primera colección':coll?'La colección está vacía':'Aún no hay '+tabs[tab].toLowerCase()}</h3><p>${showCollections?'Crea una lista para reunir los pasajes que quieras volver a leer.':'Selecciona una palabra o un pasaje en el lector para guardarlo aquí.'}</p></div>`:''}
  ${itemsCount>limit?btn('Ver más','library-more','mas','btn soft'):''}</section>`;
  const q=$('#lib-q');q.oninput=()=>{const val=q.value,pos=q.selectionStart;f.q=val;A.libLimit=40;renderLibrary(A,parts);const next=$('#lib-q');next.focus();try{next.setSelectionRange(pos,pos);}catch{}};
  const details=$('#lib-filters');if(details)details.ontoggle=()=>{if(details.isConnected)A.libFilters=details.open;};
  for(const key of ['book','color','date','collection'])if($('#lib-'+key))$('#lib-'+key).onchange=e=>{f[key]=e.target.value;A.libLimit=40;renderLibrary(A,parts);};
  $$('[data-bulk]').forEach(el=>el.onchange=()=>el.checked?A.chosen.add(el.dataset.bulk):A.chosen.delete(el.dataset.bulk));
}
export function libraryActions(A) {
  A.chosen=new Set();A.tools=(a,section)=>toolsPanel(A,a,section);
  function finished(msg,undo){A.close();A.clearSelection();A.refreshKeep();A.toast(msg,undo);}
  A.paint=async (a,color)=>{
    if(!A.F.validate(a))return;
    let oldColor,id,when;
    await A.update(d=>{const record=upsertItem(d,a,A.F,A.hash);oldColor=record.color;id=record.id;when=record.updated;record.color=color;});
    finished('Subrayado guardado.',async()=>{
      let restored=false;
      await A.update(d=>{const item=d.items.find(i=>i.id===id);if(item&&item.updated===when&&item.color===color){item.color=oldColor;item.updated=stamp();prune(d);restored=true;}});
      A.refreshKeep();A.toast(restored?'Subrayado deshecho.':'El fragmento recibió otro cambio.');
    });
  };
  const setMembership=(d,r,ids)=>{for(const c of d.collections){const has=c.items.includes(r.id);if(ids.has(c.id)&&!has)c.items.push(r.id);if(!ids.has(c.id)&&has)c.items=c.items.filter(id=>id!==r.id);}};
  function textToShare(){
    const text=A.F.slice(A.toolAnchor),ref=A.F.reference(A.toolAnchor);
    return A.data.prefs.copyFormat==='texto'?text:A.data.prefs.copyFormat==='antes'?ref+'\n'+text:text+'\n'+ref;
  }
  Object.assign(A.actions,{
    'tools-anchor':el=>A.tools(unpack(el.dataset.a)),
    'fav-anchor':async el=>{const a=unpack(el.dataset.a);if(!A.F.validate(a))return;let active;await A.update(d=>{const r=upsertItem(d,a,A.F,A.hash);r.favorite=!r.favorite;active=r.favorite;prune(d);});A.toast(active?'Guardado en favoritos.':'Quitado de favoritos.');},
    'context-anchor':el=>A.context(unpack(el.dataset.a)),
    'tool-save':()=>A.tools(A.toolAnchor,'guardar'),'tool-collections':()=>A.tools(A.toolAnchor,'colecciones'),'tool-note':()=>A.tools(A.toolAnchor,'nota'),
    'tool-bookmark':()=>A.addBookmark(A.toolAnchor),
    'source-anchor':()=>{const point=A.toolAnchor.start,v=A.F.locate(point).verse;const segment=v.loc?.find(x=>point.o>=x[4]&&point.o<x[5]);A.go('original/'+(segment?.[0]||v.p),true);},
    'paint-color':el=>A.paint(A.toolAnchor,el.dataset.color),
    'remove-color':async()=>{if(A.data.prefs.confirmDelete&&!confirm('¿Quitar el subrayado de esta selección?'))return;await A.update(d=>{const r=own({data:d},A.toolAnchor);if(r)r.color=null;prune(d);});finished('Subrayado eliminado.');},
    'toggle-fav':async()=>{let fav;await A.update(d=>{const r=upsertItem(d,A.toolAnchor,A.F,A.hash);r.favorite=!r.favorite;fav=r.favorite;prune(d);});finished(fav?'Guardado en favoritos.':'Quitado de favoritos.');},
    'save-members':async()=>{const ids=new Set($$('.member-choice:checked').map(el=>el.value));const name=$('#inline-collection').value.trim();
      await A.update(d=>{if(name){const c=newCollection(name);d.collections.push(c);ids.add(c.id);}const r=upsertItem(d,A.toolAnchor,A.F,A.hash);r.saved=true;setMembership(d,r,ids);});finished('Fragmento guardado.');},
    'note-save':async()=>{const note=$('#item-note').value;if(!note&&own(A,A.toolAnchor)?.note&&!confirm('¿Quitar esta nota personal?'))return;
      await A.update(d=>{const r=upsertItem(d,A.toolAnchor,A.F,A.hash);r.note=note;prune(d);});finished(note?'Nota personal guardada.':'Nota eliminada.');},
    'copy':async()=>{await copyText(textToShare());A.toast('Copiado.');},
    'share':async()=>{const text=textToShare();if(enIPhoneNativo()){await llamada('texto',{texto:text});return;}if(navigator.share){try{await navigator.share({title:'Biblia Peshitta',text});}catch(e){if(e.name!=='AbortError')throw e;}}
      else {await copyText(text);A.toast('Texto copiado para compartir.');}},
    'delete-item':async el=>{if(!confirm('¿Eliminar este fragmento, sus marcas y sus notas?'))return;await A.update(d=>deleteItem(d,el.dataset.id));finished('Fragmento eliminado.');},
    'collection-new':()=>editCollection(A),'collection-edit':el=>editCollection(A,el.dataset.id),
    'collection-delete':async el=>{if(!confirm('¿Eliminar esta colección? Sus fragmentos seguirán en Mi biblioteca.'))return;await A.update(d=>{const c=d.collections.find(c=>c.id===el.dataset.id);for(const id of c?.items||[]){const r=d.items.find(x=>x.id===id);if(r)r.saved=true;}d.collections=d.collections.filter(c=>c.id!==el.dataset.id);});A.go('biblioteca/colecciones',true);A.toast('Colección eliminada.');},
    'member-remove':async el=>{if(!confirm('¿Quitar el fragmento de esta colección?'))return;await A.update(d=>{const c=d.collections.find(c=>c.id===A.currentCol);if(c)c.items=c.items.filter(id=>id!==el.dataset.id);});A.refreshKeep();},
    'switch-view':async()=>{await A.update(d=>d.prefs.libraryView=d.prefs.libraryView==='lista'?'tarjetas':'lista');A.refreshKeep();},
    'library-more':()=>{A.libLimit=(A.libLimit||40)+40;A.refreshKeep();},
    'bulk-mode':()=>{A.bulk=!A.bulk;A.chosen.clear();A.refreshKeep();},
    'bulk-organize':()=>{
      if(!A.chosen.size)return A.toast('Selecciona al menos un fragmento.');
      A.dialog('Organizar '+A.chosen.size+' fragmentos',`<label>Colección de destino<select id="bulk-dest">${opt(Object.fromEntries(A.data.collections.map(c=>[c.id,c.name])),'')}</select></label><label>Nueva colección<input id="bulk-name" placeholder="Opcional"></label><label class="check"><input type="checkbox" id="bulk-move"> Mover desde las demás colecciones</label>${btn('Aplicar','bulk-apply','ok','btn primary')}`);
    },
    'bulk-apply':async()=>{const id=$('#bulk-dest').value,name=$('#bulk-name').value.trim(),move=$('#bulk-move').checked;if(!id&&!name)return A.toast('Elige o crea una colección.');
      await A.update(d=>{let c=d.collections.find(x=>x.id===id);if(name){c=newCollection(name);d.collections.push(c);}if(!c)return;
        for(const i of d.items.filter(i=>A.chosen.has(i.id))){if(move)for(const other of d.collections)if(other!==c)other.items=other.items.filter(x=>x!==i.id);if(!c.items.includes(i.id))c.items.push(i.id);i.saved=true;}
      });A.bulk=false;A.chosen.clear();finished('Colección actualizada.');}
  });
  for(const [action,delta] of [['collection-up',-1],['collection-down',1],['member-up',-1],['member-down',1]]){
    A.actions[action]=async el=>{await A.update(d=>{const id=el.dataset.id;if(action.startsWith('collection'))reorder(d.collections,d.collections.findIndex(c=>c.id===id),delta);
      else {const c=d.collections.find(c=>c.id===A.currentCol);if(c)reorder(c.items,c.items.indexOf(id),delta);}});A.refreshKeep();};
  }
}

