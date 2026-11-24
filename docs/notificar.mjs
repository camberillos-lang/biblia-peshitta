import {read,writeMany} from './almacen.mjs';
const device='push';
export async function pushState(){return (await read('dispositivo',device))||{};}
export const supportsPush=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);
function serviceUrl(input) {
  let url;
  try{url=new URL(input);} catch{throw Error('Escribe la URL HTTPS del servicio de avisos.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash) throw Error('La dirección del servicio debe ser HTTPS.');
  return url.href.replace(/\/+$/,'');
}
async function api(url,path,options={}) {
  let res;
  try {res=await fetch(url+path,{...options,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});}
  catch {throw Error('No hubo conexión con el servicio. Revisa la dirección, el origen permitido y tu conexión.');}
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw Error(typeof body.error==='string'?body.error:'El servicio de avisos respondió '+res.status+'.');
  return body;
}
function from64(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));}
function secret() {const v=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...v)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export async function connectService(input) {
  const url=serviceUrl(input),prev=await pushState();
  if(prev.id&&prev.url!==url) throw Error('Desactiva primero los avisos del servicio anterior.');
  const conf=await api(url,'/v1/config');
  if(conf.version!==1||typeof conf.publicKey!=='string'||from64(conf.publicKey).length!==65) throw Error('El servicio devolvió una clave pública inválida.');
  const state={...prev,url,publicKey:conf.publicKey,secret:prev.secret||secret()};
  await writeMany('dispositivo',[[device,state]]);
  return state;
}
// Permission must be requested directly from a button event on iOS.
export function activatePush(schedule,state) {
  if(!supportsPush()) throw Error('Este navegador no ofrece Web Push aquí. En iPhone abre la app desde la pantalla de inicio.');
  if(!state?.publicKey) throw Error('Conecta primero el servicio de avisos.');
  const permission=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
  return permission.then(async allowed=>{
    if(allowed!=='granted')throw Error('El permiso de notificaciones está desactivado. Puedes cambiarlo en los ajustes del dispositivo.');
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:from64(state.publicKey)});
    const result=await api(state.url,'/v1/subscriptions',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.secret},body:JSON.stringify({subscription:sub.toJSON(),schedule})});
    const saved={...state,id:result.id,nextAt:result.nextAt,enabled:true,schedule};
    await writeMany('dispositivo',[[device,saved]]);
    return saved;
  });
}
export async function stopPush(state) {
  if(state?.id) await api(state.url,'/v1/subscriptions/'+encodeURIComponent(state.id),{method:'DELETE',headers:{Authorization:'Bearer '+state.secret}});
  if(supportsPush()){
    const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription();if(sub)await sub.unsubscribe();
  }
  const saved={...state,id:null,nextAt:null,enabled:false};
  await writeMany('dispositivo',[[device,saved]]);
  return saved;
}
export async function testPush(state){
  if(!state?.enabled) throw Error('Primero activa los avisos en este dispositivo.');
  return api(state.url,'/v1/subscriptions/'+encodeURIComponent(state.id)+'/test',{method:'POST',headers:{Authorization:'Bearer '+state.secret}});
}
