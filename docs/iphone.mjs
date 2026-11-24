import {read,writeMany} from './almacen.mjs';
import {nextReminder,scheduleSettings} from './horarios.mjs';
import {keyOf} from './personal.mjs';
import {choosePassage,dayVerse,notifiedAnchor} from './azar.mjs';

const LIMIT = 60;
const handler = () => globalThis.peshittaAndroid || globalThis.webkit?.messageHandlers?.peshitta;
export const enIPhoneNativo = () => Boolean(handler()?.postMessage);
export const llamada = (accion, datos = {}) => handler().postMessage({accion,...datos});
let tarea = Promise.resolve();
function ordenada(fn) {
  const p = tarea.then(fn);
  tarea = p.catch(() => {});
  return p;
}
function fechaLocal(at, timezone) {
  const partes = new Intl.DateTimeFormat('es-MX', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
  const p = Object.fromEntries(partes.map(x=>[x.type,x.value]));
  return [p.year,p.month,p.day].join('-');
}
function firma(A,p) {
  const s=p.noticeSource;
  const usaBiblioteca=s.favor||s.high||s.mix||['stored','favorites','highlights','collections'].includes(s.scope);
  return JSON.stringify([p.schedule,s,p.noticeLength,p.noRepeat,A.hash,
    usaBiblioteca?A.data.items.map(i=>[i.id,keyOf(i.anchor),i.favorite,i.color]):null,
    s.scope==='collections'?A.data.collections.filter(c=>s.collections.includes(c.id)).map(c=>[c.id,c.items]):null]);
}
function aviso(A,p,h,recientes,semilla) {
  const s=p.noticeSource;
  const simple=h.kind==='daily'&&s.scope==='all'&&!s.favor&&!s.high&&!s.mix;
  const fecha=fechaLocal(h.at,p.schedule.timezone);
  const ancla=simple?dayVerse(A.corpus,A.F,fecha):choosePassage(A.corpus,A.F,A.data,s,recientes,semilla+h.id);
  if(!ancla) return null;
  const parte=notifiedAnchor(A.F,ancla,p.noticeLength);
  if(!parte)return null;
  const recortado=keyOf(parte)!==keyOf(ancla);
  return {...h,clave:keyOf(ancla),cuerpo:A.F.slice(parte)+'\n'+A.F.reference(parte)+(recortado?'\nAbre la app para leer el pasaje completo.':''),ruta:'#aviso/'+encodeURIComponent(JSON.stringify(parte))};
}
export async function planificar(A,p,previo={},ahora=Date.now(),limite=LIMIT) {
  const huella=firma(A,p);
  const semilla=previo.semilla||crypto.randomUUID();
  const viejos=previo.futuros||[];
  const pasados=[...(previo.pasados||[]),...viejos.filter(x=>x.at<=ahora)].slice(-500);
  const futuros=previo.huella===huella?viejos.filter(x=>x.at>ahora).slice(0,limite):[];
  const horario=scheduleSettings(p.schedule);
  const historial=[...pasados,...futuros];
  let cursor=futuros.at(-1)?.at||ahora;
  while(futuros.length<limite) {
    const h=nextReminder(horario,cursor,semilla,historial.slice(-500));
    const recientes=p.noRepeat?historial.slice(-p.noRepeat).map(x=>x.clave):[];
    const entrada=aviso(A,p,h,recientes,semilla);
    if(!entrada)break;
    futuros.push(entrada);historial.push(entrada);cursor=h.at;
    if(futuros.length%4===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return {huella,semilla,pasados:pasados.map(({id,at,kind,clave})=>({id,at,kind,clave})),futuros};
}
async function programar(A,p,estricto,forzar) {
  const previo=await read('dispositivo','plan-iphone')||{};
  if(!forzar&&previo.huella===firma(A,p)&&previo.futuros?.length===LIMIT&&previo.futuros[0]?.at>Date.now())return A.push;
  const plan=await planificar(A,p,previo);
  if(estricto&&!plan.futuros.length) throw Error('El origen elegido está vacío. Elige un libro o guarda un fragmento.');
  await llamada('programar',{avisos:plan.futuros.map(({id,at,cuerpo,ruta})=>({id,at,cuerpo,ruta}))});
  const state={enabled:true,local:true,nextAt:plan.futuros[0]?.at||null,until:plan.futuros.at(-1)?.at||null};
  await writeMany('dispositivo',[['plan-iphone',plan],['push',state]]);
  A.push=state;
  return state;
}
export function activarIPhone(A,p) {
  return ordenada(async()=>{
    if(!(await llamada('permiso')))throw Error('Activa las notificaciones de Biblia Peshitta en los ajustes de tu dispositivo.');
    return programar(A,p,true,true);
  });
}
export function apagarIPhone(A) {
  return ordenada(async()=>{
    await llamada('detener');
    const state={enabled:false,local:true};
    const previo=await read('dispositivo','plan-iphone');
    const entries=[['push',state]];
    if(previo) entries.push(['plan-iphone',{...previo,huella:'',futuros:[],pasados:[...(previo.pasados||[]),...previo.futuros.filter(x=>x.at<=Date.now())].slice(-500)}]);
    await writeMany('dispositivo',entries);
    A.push=state;return state;
  });
}
export async function probarIPhone(A) {
  const h={at:Date.now()+5000,kind:'regular',id:'prueba'};
  const a=aviso(A,A.data.prefs,h,[],crypto.randomUUID());
  if(!a) throw Error('Elige un origen que contenga algún fragmento.');
  await llamada('prueba',{aviso:a});
}
export function actualizarIPhone(A,forzar=false) {
  if(!enIPhoneNativo()||!A.corpus||!A.push?.enabled) return;
  clearTimeout(A.tiempoLocal);
  A.tiempoLocal=setTimeout(()=>ordenada(async()=>{
    if(A.push?.enabled)await programar(A,A.data.prefs,false,forzar);
  }).catch(A.error),550);
}
export async function alAbrirIPhone(A) {
  if(!enIPhoneNativo()||!A.corpus)return;
  const ruta=await llamada('ruta');
  if(typeof ruta==='string'&&/^#(aviso|pasaje)\//.test(ruta))A.go(ruta.slice(1),true);
  actualizarIPhone(A,true);
}
export function compartirArchivo(nombre,blob){
  if (globalThis.peshittaAndroid && nombre === 'Biblia-Peshitta.pdf') return llamada('archivo',{nombre});
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('No se pudo preparar el archivo.'));
    reader.onload=()=>llamada('archivo',{nombre,base64:reader.result.split(',')[1]}).then(resolve,reject);
    reader.readAsDataURL(blob);
  });
}
