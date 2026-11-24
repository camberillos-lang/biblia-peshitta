import {enIPhoneNativo,compartirArchivo} from '../iphone.mjs';
export const esc = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $=(s,el=document)=>el.querySelector(s);
export const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const paths={
 home:'<path d="m3 10 9-7 9 7v10h-6v-6H9v6H3z"/>',
 libro:'<path d="M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2z"/><path d="M12 6v15"/>',
 buscar:'<circle cx="10.5" cy="10.5" r="6.3"/><path d="m15 15 5 5"/>',
 coleccion:'<path d="M4 4v15m5-15v15M13 5l4-1 4 14-4 1z"/>',
 ajustes:'<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
 flecha:'<path d="m9 5 7 7-7 7"/>', atras:'<path d="m15 5-7 7 7 7"/>',
 estrella:'<path d="m12 3 2.6 5.6 6.2.9-4.5 4.4 1.1 6.1-5.4-3-5.4 3 1.1-6.1-4.5-4.4 6.2-.9z"/>',
 corazon:'<path d="M20.5 5.5a5 5 0 0 0-8.5 3 5 5 0 0 0-8.5-3c-4 5 2 9.5 8.5 15 6.5-5.5 12.5-10 8.5-15Z"/>',
 marca:'<path d="M6 3h12v18l-6-4-6 4z"/>', reloj:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 pluma:'<path d="m4 16 11-12 5 4L9 20l-6 1zM12 7l5 4"/>',
 azar:'<path d="m3 7 3 0c5 0 7 10 12 10h3m-4-4 4 4-4 4M3 17h3c2 0 3-1 4-3m3-5c1-1 2-2 5-2h3m-4-4 4 4-4 4"/>',
 sol:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
 pagina:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h7"/>',
 nota:'<path d="M4 3h16v13l-5 5H4zM14 20v-6h6M8 8h8m-8 4h5"/>',
 carpeta:'<path d="M3 6h6l2 2h10v11H3z"/>', hoja:'<path d="M4 19C2 9 11 4 20 4c1 9-4 17-13 15m-4 2L15 9"/>',
 etiqueta:'<path d="M3 4h9l9 9-8 8-10-10z"/><circle cx="8" cy="8" r="1"/>', subir:'<path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/>',
 abajo:'<path d="M12 3v14m-5-5 5 5 5-5M3 17v4h18v-4"/>', cerrar:'<path d="m6 6 12 12m0-12L6 18"/>',
 mas:'<path d="M12 4v16M4 12h16"/>', puntos:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 copiar:'<rect x="7" y="7" width="13" height="14" rx="2"/><path d="M16 7V3H3v13h4"/>',
 compartir:'<path d="M12 15V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/>', foco:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',
 campana:'<path d="M4 17h16c-2-2-2-4-2-7a6 6 0 0 0-12 0c0 3 0 5-2 7m5 3q3 3 6 0"/>',
 lista:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
 cuadricula:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 ok:'<path d="m4 12 5 5L20 6"/>', orden:'<path d="m5 9 3-3 3 3M8 6v12m5-3 3 3 3-3m-3 3V6"/>',
 control:'<path d="M3 6h18M3 12h18M3 18h18"/>', papelera:'<path d="M4 6h16M8 6V3h8v3M6 6l1 15h10l1-15"/>'
};
export function icon(name){ return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.libro}</svg>`; }
export const btn=(text,action,ico='',cls='btn',extra='')=>`<button type="button" class="${cls}" data-act="${esc(action)}" ${extra}>${ico?icon(ico):''}<span>${esc(text)}</span></button>`;
export const ibtn=(name,action,ico,extra='')=>`<button type="button" class="iconbtn" data-act="${esc(action)}" aria-label="${esc(name)}" title="${esc(name)}" ${extra}>${icon(ico)}</button>`;
export const opt=(obj,selected)=>Object.entries(obj).map(([k,v])=>`<option value="${esc(k)}" ${String(selected)===k?'selected':''}>${esc(v)}</option>`).join('');
export const dateLabel=(date)=>new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'long',year:'numeric'}).format(new Date(date));
export const stamp=()=>new Date().toISOString();
export const pack=a=>encodeURIComponent(JSON.stringify(a));
export const unpack=s=>{try{return JSON.parse(decodeURIComponent(s||''));}catch{return null;}};
export const active=(name,actual)=>name===actual?' aria-current="page" class="active"':'';
export function rings(text,ranges=[]) {
  let out='',last=0;
  for(const [s,e] of ranges){ if(s<last||e<=s)continue;out+=esc(text.slice(last,s))+'<mark>'+esc(text.slice(s,e))+'</mark>';last=e; }
  return out+esc(text.slice(last));
}
export async function download(filename,blob){
  if(enIPhoneNativo())return compartirArchivo(filename,blob);
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function copyText(text){
  if(navigator.clipboard?.writeText) {try{await navigator.clipboard.writeText(text);return;}catch{}}
  const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;left:-200vw';(document.querySelector('dialog[open]')||document.body).append(area);area.select();
  const ok=document.execCommand('copy');area.remove();if(!ok) throw Error('El sistema no permitió copiar el texto.');
}
