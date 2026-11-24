import {read,change} from './almacen.mjs';
import {blank,keyOf} from './personal.mjs';
import {createFragments} from './fragmentos.mjs';
import {choosePassage,dayVerse,notifiedAnchor,today} from './azar.mjs';
const scope=self.registration.scope;
const rooted=file=>new URL(file,scope).href;
const prefix='peshitta:'+new URL(scope).pathname+':';
const cacheName=prefix+'3c462a7420c575';
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const res=await fetch(rooted('sin-conexion.json'),{cache:'no-store'});
  if(!res.ok)throw Error('Falta el inventario de la aplicación.');
  const paths=await res.json(),cache=await caches.open(cacheName);
  await cache.addAll(paths.map(path=>new Request(rooted(path),{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const own=(await caches.keys()).filter(k=>k.startsWith(prefix)&&k!==cacheName);
  await Promise.all(own.map(k=>caches.delete(k)));await self.clients.claim();
})()));
self.addEventListener('message',event=>{
  if(event.data==='offline-status') event.waitUntil((async()=>{
    const c=await caches.open(cacheName);event.ports[0]?.postMessage({ready:!!(await c.match(rooted('index.html')))});
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!event.request.url.startsWith(scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    const path=new URL(event.request.url);path.search='';path.hash='';
    if(event.request.mode==='navigate'&&[scope,rooted('index.html')].includes(path.href)) return (await cache.match(rooted('index.html')))||fetch(event.request);
    return (await cache.match(event.request))||fetch(event.request);
  })());
});
self.addEventListener('push',event=>event.waitUntil((async()=>{
  let meta={};
  try{meta=event.data?.json()||{};}catch{}
  const [corpus,personal,device]=await Promise.all([read('edicion','corpus'),read('usuario','datos'),read('dispositivo','push')]);
  const data=personal||blank(),F=corpus?createFragments(corpus):null;
  const id=typeof meta.id==='string'?meta.id:'local-'+Date.now();
  const previous=await read('dispositivo','avisos-usados')||{keys:[],sent:[]};
  // The same push event may be delivered again. Reuse its passage and tag.
  let anchor=previous.sent.find(x=>x.id===id)?.anchor;
  if(corpus&&device?.enabled&&!anchor) {
    const s=data.prefs.noticeSource,t=today();
    const simpleDaily=meta.kind==='daily'&&s.scope==='all'&&!s.favor&&!s.high&&!s.mix;
    anchor=simpleDaily?dayVerse(corpus,F,t):choosePassage(corpus,F,data,s,previous.keys,meta.kind==='daily'?t:null);
  }
  if(!device?.enabled || !anchor || !F.validate(anchor)) return;
  const shown=notifiedAnchor(F,anchor,data.prefs.noticeLength);
  if(!shown) return;
  const target='#aviso/'+encodeURIComponent(JSON.stringify(shown));
  await change('dispositivo','avisos-usados',v=>{
    const current=v||{keys:[],sent:[]};
    if(!current.sent.some(x=>x.id===id)){
      current.keys=data.prefs.noRepeat?[...current.keys,keyOf(anchor)].slice(-data.prefs.noRepeat):[];
      current.sent=[...current.sent,{id,anchor}].slice(-72);
    }
    return current;
  });
  const body=F.slice(shown)+'\n'+F.reference(shown)+(keyOf(shown)!==keyOf(anchor)?'\nAbre la app para leer el pasaje completo.':'');
  const options={body,icon:rooted('assets/icon-192.png'),tag:'peshitta-'+id,data:{target}};
  if(typeof Notification!=='undefined'&&Notification.maxActions>0)options.actions=[{action:'contexto',title:'VER CONTEXTO COMPLETO'}];
  await self.registration.showNotification('Biblia Peshitta',options);
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const raw=event.notification.data?.target||'#inicio';
    let target=raw.startsWith('#aviso/')?raw:'#ajustes/avisos';
    if(event.action==='contexto'&&target.startsWith('#aviso/')) target=target.replace('#aviso/','#pasaje/');
    const url=rooted('./')+target;
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const open=clients.find(c=>c.url.startsWith(scope));
    if(open){await open.focus();open.postMessage({type:'abrir-aviso',hash:target});}
    else await self.clients.openWindow(url);
  })());
});
