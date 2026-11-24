import {enIPhoneNativo,activarIPhone,apagarIPhone,probarIPhone} from '../iphone.mjs';
import {$,$$,btn,esc,icon,opt,download} from './comun.mjs';
import {themes,modes,colorNames,exportBackup,restoreBackup,prune} from '../personal.mjs';
import {pushState,connectService,activatePush,stopPush,testPush,supportsPush} from '../notificar.mjs';
import {choosePassage} from '../azar.mjs';
import {scheduleSettings} from '../horarios.mjs';
const sections={apariencia:'Apariencia',lectura:'Lectura',buscador:'Buscador',subrayados:'Subrayados',azar:'Sorpréndeme',avisos:'Notificaciones',datos:'Mis datos',edicion:'Mi edición'};
const select=(id,title,choices,val)=>`<label>${title}<select name="${id}" id="set-${id}">${opt(choices,val)}</select></label>`;
const checkbox=(id,title,val)=>`<label class="check"><input type="checkbox" name="${id}" ${val?'checked':''}>${title}</label>`;
const number=(id,title,val,min,max,step=1)=>`<label>${title}<input type="number" name="${id}" min="${min}" max="${max}" step="${step}" required value="${esc(val)}"></label>`;
const range=(id,title,val,min,max,step=1)=>`<label>${title}<span class="range-field"><input type="range" name="${id}" min="${min}" max="${max}" step="${step}" value="${esc(val)}"><output>${esc(val)}</output></span></label>`;
const time=(id,title,val)=>`<label>${title}<input type="time" name="${id}" value="${esc(val)}" required></label>`;
const srcs={all:'Toda la Biblia',AT:'Antiguo Testamento',NT:'Nuevo Testamento',books:'Libros que elija',stored:'Todos mis fragmentos',favorites:'Solo favoritos',highlights:'Solo subrayados',collections:'Solo las colecciones que elija'};
function sources(A,s){
  const list=(type,rows,chosen)=>rows.map(([id,name])=>`<label class="check"><input type="checkbox" value="${esc(id)}" name="${type}" ${chosen.includes(id)?'checked':''}>${esc(name)}</label>`).join('');
  return `${select('scope','Origen de los textos',srcs,s.scope)}
  <fieldset data-source-group="books" ${s.scope==='books'?'':'hidden'}><legend>Libros permitidos</legend><div class="check-list">${list('books',A.corpus.books.map(b=>[b.id,b.name]),s.books)}</div></fieldset>
  <fieldset data-source-group="collections" ${s.scope==='collections'?'':'hidden'}><legend>Colecciones permitidas</legend>${list('collections',A.data.collections.map(c=>[c.id,c.name]),s.collections)||'<p class="hint">Crea una colección en Mi biblioteca para elegirla aquí.</p>'}</fieldset>
  ${checkbox('favor','Dar prioridad a mis favoritos',s.favor)+checkbox('high','Dar prioridad a mis subrayados',s.high)+checkbox('mix','Mezclar pasajes bíblicos y fragmentos guardados',s.mix)}`;
}
function sourceValues(form){
  const fd=new FormData(form),scope=fd.get('scope'),books=fd.getAll('books'),collections=fd.getAll('collections');
  if(scope==='books'&&!books.length)throw Error('Selecciona al menos un libro.');
  if(scope==='collections'&&!collections.length)throw Error('Selecciona al menos una colección.');
  return {scope,books,collections,favor:fd.has('favor'),high:fd.has('high'),mix:fd.has('mix')};
}
function eligible(A,source){
  if(!choosePassage(A.corpus,A.F,A.data,source))throw Error('El origen elegido está vacío. Guarda un fragmento o elige otro origen.');
}
function readSchedule(form){
  const f=new FormData(form),s={timezone:f.get('timezone').trim(),days:f.getAll('day').map(Number),count:Number(f.get('count')),start:f.get('start'),end:f.get('end'),mode:f.get('scheduleMode'),minInterval:Number(f.get('minInterval')),quiet:f.has('quiet'),quietStart:f.get('quietStart'),quietEnd:f.get('quietEnd'),special:f.has('special')};
  const typed=f.get('times').trim();
  if(typed&&s.mode==='fixed')s.times=typed.split(/[\s,;]+/).filter(Boolean);
  return scheduleSettings(s);
}
function notice(A,p) {
  const s=p.schedule,dev=A.push||{};
  const entregaLocal=`<section class="config-block"><h3>Avisos en tu iPhone</h3><p class="status-text">${dev.enabled?'Avisos activados.':'Puedes recibir pasajes incluso sin conexión.'}</p>
  ${dev.enabled&&dev.until?'<p>Programados hasta '+esc(new Date(dev.until).toLocaleString('es-MX'))+'. Al abrir la app se preparan los siguientes.</p>':''}
  <div class="line-actions">${dev.enabled?btn('Enviar prueba real','test-push','campana','btn soft')+btn('Desactivar','stop-push','','quiet'):btn('Activar avisos','start-push','campana','btn primary')}</div></section>`;
  const entregaWeb=`<section class="config-block"><h3>Entrega en este dispositivo</h3><p class="status-text">${!supportsPush()?'Abre la aplicación instalada en un navegador compatible con Web Push.':dev.enabled?'Avisos activados en este dispositivo.':dev.publicKey?'Servicio conectado. Falta activar el permiso de este dispositivo.':'Para recibir avisos con la app cerrada, conecta el servicio incluido en el paquete.'}</p>
  <label>Dirección del servicio<input type="url" id="service-url" placeholder="https://…workers.dev" value="${esc(dev.url||'')}"></label>
  <div class="line-actions">${btn('Conectar servicio','connect-push','campana','btn soft')}
  ${dev.enabled?btn('Enviar prueba real','test-push','campana','btn soft')+btn('Desactivar','stop-push','','quiet'):dev.publicKey?btn('Activar avisos','start-push','campana','btn primary'):''}</div></section>`;
  return `${enIPhoneNativo()?entregaLocal:entregaWeb}
  <h3>Horario</h3><div class="form-grid">${number('count','Avisos por día',s.count,1,48)+select('scheduleMode','Distribución',{fixed:'Horarios fijos',random:'Horarios aleatorios'},s.mode)+time('start','Desde',s.start)+time('end','Hasta',s.end)+number('minInterval','Intervalo mínimo (minutos)',s.minInterval,1,1440)}
  <label>Zona horaria<input name="timezone" value="${esc(s.timezone)}" required></label></div>
  <label id="times-row" ${s.mode==='fixed'?'':'hidden'}>Horas fijas personalizadas<input name="times" placeholder="09:00, 17:30" value="${esc((s.times||[]).join(', '))}"><small>Vacío distribuye los avisos dentro de tu franja.</small></label>
  <fieldset><legend>Días de la semana</legend><div class="weekday">${['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((name,i)=>`<label><input type="checkbox" name="day" value="${i}" ${s.days.includes(i)?'checked':''}>${name}</label>`).join('')}</div></fieldset>
  ${checkbox('quiet','Evitar avisos durante el descanso',s.quiet)}<div class="form-grid">${time('quietStart','Inicio del descanso',s.quietStart)+time('quietEnd','Fin del descanso',s.quietEnd)}</div>
  ${checkbox('special','Dedicar el primer aviso al versículo del día',s.special)}<h3>Pasajes</h3>${sources(A,p.noticeSource)}
  <div class="form-grid">${number('noticeLength','Máximo de caracteres del fragmento',p.noticeLength,20,500)+number('noRepeat','Evitar repetir los últimos',p.noRepeat,0,500)}</div>`;
}
function fields(A,section){
  const p=A.data.prefs;
  if(section==='apariencia')return `<div class="form-grid">${select('theme','Tema',themes,p.theme)+select('font','Tipografía de lectura',{editorial:'Editorial',clasica:'Clásica',sans:'Sin remates',sistema:'Sistema'},p.font)}
  <label>Color principal<input type="color" name="accent" value="${p.accent}"></label>${select('density','Densidad',{amplia:'Amplia',compacta:'Compacta'},p.density)}</div>
  ${range('size','Tamaño de letra',p.size,16,36)+range('line','Interlineado',p.line,1.2,2.3,.05)+range('margin','Margen del lector',p.margin,8,56)+checkbox('motion','Animaciones suaves',p.motion)}`;
  if(section==='lectura')return checkbox('numbers','Mostrar números de versículo',p.numbers)+checkbox('headings','Mostrar encabezados impresos',p.headings)+checkbox('rememberPosition','Recordar la última ubicación',p.rememberPosition)+checkbox('hideControls','Ocultar los controles al desplazarme',p.hideControls)+checkbox('confirmSelection','Confirmar antes de abandonar una selección',p.confirmSelection)+select('scrolling','Desplazamiento',{continuo:'Lectura continua entre capítulos',capitulo:'Un capítulo por pantalla'},p.scrolling)+select('copyFormat','Referencia al copiar o compartir',{despues:'Debajo del fragmento',antes:'Encima del fragmento',texto:'Solo texto seleccionado'},p.copyFormat);
  if(section==='buscador')return select('defaultMode','Categoría inicial',modes,p.defaultMode)+checkbox('rememberMode','Recordar mi última categoría',p.rememberMode)+checkbox('suggestions','Sugerencias al buscar',p.suggestions)+checkbox('typos','Sugerir correcciones tipográficas',p.typos)+checkbox('approx','Permitir coincidencias aproximadas',p.approx)+select('order','Orden predeterminado',{relevance:'Relevancia',biblical:'Orden bíblico'},p.order)+number('pageSize','Resultados por página',p.pageSize,5,100)+checkbox('searchHistory','Guardar historial de búsqueda',p.searchHistory);
  if(section==='subrayados')return `<fieldset><legend>Mi paleta</legend><div class="palette-edit">${p.palette.map((c,i)=>`<label>${colorNames[i]}<input name="pal-${i}" type="color" value="${c}"></label>`).join('')}</div></fieldset><label>Color predeterminado<input type="color" name="defaultColor" value="${p.defaultColor}"></label>${checkbox('showHighlights','Mostrar mis subrayados en el lector',p.showHighlights)+checkbox('confirmDelete','Confirmar al quitar un subrayado',p.confirmDelete)+select('highlightsOrder','Orden de los subrayados',{recientes:'Más recientes',antiguos:'Más antiguos',biblico:'Orden bíblico'},p.highlightsOrder)}`;
  if(section==='azar')return sources(A,p.random);
  if(section==='avisos')return notice(A,p);
  return '';
}
const humanDate=n=>n.toLocaleString('es-MX');
function edition(A){
 const c=A.corpus,r=c.review||{};
 const pageLinks=pages=>pages.map(n=>`<a href="#original/${n}">${n}</a>`).join(' ');
 return `<div class="config-block"><h3>Biblia Peshitta</h3><p>${humanDate(c.source.pages)} páginas · ${c.books.length} libros · ${A.counts.chapters.toLocaleString('es-MX')} capítulos · ${A.counts.verses.toLocaleString('es-MX')} versículos</p>
 <p id="offline-edition" class="status-text">${A.offline?'Edición y aplicación listas sin conexión.':A.offlineError?'La descarga sin conexión está pendiente. Abre de nuevo con internet.':'Comprobando la disponibilidad sin conexión…'}</p>${btn('Abrir el PDF original','original','pagina','btn soft')}<details class="options-bar"><summary>Huella SHA-256 del PDF</summary><code class="break">${esc(A.hash)}</code></details></div>
 <div class="config-block"><h3>Incidencias de la edición</h3><p>En las páginas con recorte, la lectura utiliza los caracteres codificados en el PDF. En seis páginas editoriales, dos extractores discrepan en el orden de caracteres bidireccionales. El facsímil conserva su disposición impresa.</p>
 <details class="options-bar"><summary>Páginas con recortes (${r.clipPages?.length||0})</summary><div class="page-links">${pageLinks(r.clipPages||[])}</div></details>
 <details class="options-bar"><summary>Páginas con texto bidireccional</summary><div class="page-links">${pageLinks(r.bidirectionalPages||[])}</div></details>
 <details class="options-bar"><summary>Páginas de imagen sin texto seleccionable</summary><div class="page-links">${pageLinks(r.imagePages||[])}</div></details></div>`;
}
const parts={todo:'Respaldo completo',favoritos:'Favoritos',colecciones:'Colecciones',subrayados:'Subrayados',notas:'Notas personales',fragmentos:'Todos los fragmentos'};
function personalData(){
  return `<div class="config-block"><h3>Exportar</h3><p>El archivo JSON incluye las referencias y las posiciones exactas. Si contiene notas, cualquier persona con el archivo podrá leerlas.</p>
  ${select('export-type','Incluir',parts,'todo')+btn('Descargar archivo','export-data','abajo','btn primary')}</div>
  <div class="config-block"><h3>Importar o restaurar</h3>${select('import-mode','Modo',{merge:'Añadir a mi biblioteca',replace:'Restaurar un respaldo completo'},'merge')}
  <label class="btn soft file-button">${icon('subir')} Elegir respaldo<input type="file" id="backup-file" accept=".json,application/json"></label></div>
  <div class="config-block"><h3>Borrar datos seleccionados</h3>${select('clear-type','Datos',{history:'Historial de lectura',queries:'Historial de búsqueda',bookmarks:'Marcadores',favoritos:'Favoritos',subrayados:'Subrayados',notas:'Notas personales',colecciones:'Colecciones',fragmentos:'Todos los fragmentos personales'},'history')+btn('Borrar selección','clear-data','papelera','quiet danger')}</div>`;
}
export function renderSettings(A,partsNow){
  const section=Object.hasOwn(sections,partsNow[1])?partsNow[1]:'apariencia';
  A.main.innerHTML=`<section class="page"><div class="page-heading"><div><p class="eyebrow">Personalización</p><h1>Ajustes</h1></div></div>
  <div class="settings-layout"><nav class="setting-tabs" aria-label="Secciones de ajustes">${Object.entries(sections).map(([k,t])=>`<a class="${k===section?'selected':''}" href="#ajustes/${k}">${t}</a>`).join('')}</nav><section class="settings-pane"><h2>${sections[section]}</h2>
  ${section==='datos'?personalData():section==='edicion'?edition(A):`<form id="settings-form">${fields(A,section)}<div class="dialog-actions"><button type="submit" class="btn primary">Guardar ajustes</button></div></form>`}</section></div></section>`;
  if(section==='datos'){
    $('#backup-file').onchange=async e=>{try{
      const file=e.target.files[0];if(!file)return;const replace=$('#set-import-mode').value==='replace';
      if(replace&&!confirm('¿Reemplazar tus datos personales por este respaldo completo?'))return;
      const parsed=JSON.parse(await file.text());
      await A.update(d=>Object.assign(d,restoreBackup(d,parsed,A.hash,A.F,replace)));
      A.apply();A.refreshKeep();A.toast(replace?'Respaldo restaurado.':'Datos importados.');}catch(err){A.error(err);}finally{e.target.value='';}};
  }
  const form=$('#settings-form');if(!form)return;
  $$('input[type=range]',form).forEach(e=>e.oninput=()=>e.nextElementSibling.value=e.value);
  const scope=$('#set-scope');if(scope)scope.onchange=()=>$$('[data-source-group]').forEach(e=>e.hidden=e.dataset.sourceGroup!==scope.value);
  const mode=$('#set-scheduleMode');if(mode)mode.onchange=()=>$('#times-row').hidden=mode.value!=='fixed';
  form.onsubmit=async e=>{
    e.preventDefault();try{
      const values={};
      if(section==='azar')values.random=sourceValues(form);
      else if(section==='avisos'){
        values.noticeSource=sourceValues(form);values.schedule=readSchedule(form);
        values.noticeLength=Number(form.elements.noticeLength.value);values.noRepeat=Number(form.elements.noRepeat.value);
        if(A.push?.enabled)eligible(A,values.noticeSource);
        if(A.push?.enabled)A.push=enIPhoneNativo()?await activarIPhone(A,{...A.data.prefs,...values}):await activatePush(values.schedule,A.push);
      }else{
        for(const el of form.elements){
          if(!el.name||el.name.startsWith('pal-'))continue;
          values[el.name]=el.type==='checkbox'?el.checked:['range','number'].includes(el.type)?Number(el.value):el.value;
        }
        if(section==='subrayados')values.palette=Array.from({length:6},(_,i)=>form.elements.namedItem('pal-'+i).value);
      }
      await A.update(d=>Object.assign(d.prefs,values));
      if(section==='buscador'&&A.searchState) {A.searchState.order=values.order;if(!values.rememberMode)A.searchState.mode=values.defaultMode;}
      A.apply();A.refreshKeep();A.toast('Ajustes guardados.');
    }catch(err){A.error(err);}
  };
}
export function settingsActions(A) {
  Object.assign(A.actions,{
    'connect-push':async()=>{const url=$('#service-url').value;A.push=await connectService(url);A.refreshKeep();A.toast('Servicio conectado.');},
    'start-push':async()=>{const f=$('#settings-form');if(!f.reportValidity())return;const schedule=readSchedule(f),noticeSource=sourceValues(f);const noticeLength=+f.elements.noticeLength.value,noRepeat=+f.elements.noRepeat.value;
      eligible(A,noticeSource);A.push=enIPhoneNativo()?await activarIPhone(A,{...A.data.prefs,schedule,noticeSource,noticeLength,noRepeat}):await activatePush(schedule,A.push);await A.update(d=>Object.assign(d.prefs,{schedule,noticeSource,noticeLength,noRepeat}));A.refreshKeep();A.toast('Avisos activados.');},
    'stop-push':async()=>{A.push=enIPhoneNativo()?await apagarIPhone(A):await stopPush(A.push);A.refreshKeep();A.toast('Avisos desactivados.');},
    'test-push':async()=>{if(enIPhoneNativo()){await probarIPhone(A);A.toast('Aviso de prueba programado para dentro de cinco segundos.');}else{await testPush(A.push);A.toast('El proveedor aceptó el envío de prueba.');}},
    'export-data':async()=>{const kind=$('#set-export-type').value;const file=exportBackup(A.data,A.hash,kind);await download('Peshitta-'+kind+'-'+new Date().toISOString().slice(0,10)+'.json',new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));A.toast('Archivo de respaldo preparado.');},
    'clear-data':async()=>{const part=$('#set-clear-type').value,label=$('#set-clear-type').selectedOptions[0].textContent;
      if(!confirm('¿Borrar '+label.toLowerCase()+' de este dispositivo?'))return;
      await A.update(d=>{
        if(['history','queries','bookmarks'].includes(part))d[part]=[];
        if(part==='history')d.last=null;
        if(part==='colecciones'){for(const c of d.collections)for(const id of c.items){const r=d.items.find(i=>i.id===id);if(r)r.saved=true;}d.collections=[];}
        if(part==='fragmentos'){d.items=[];for(const c of d.collections)c.items=[];}
        if(part==='favoritos')for(const i of d.items)i.favorite=false;
        if(part==='subrayados')for(const i of d.items)i.color=null;
        if(part==='notas')for(const i of d.items)i.note='';
        prune(d);
      });A.refreshKeep();A.toast('Datos seleccionados eliminados.');}
  });
}

