import {writeMany} from './almacen.mjs';
export const sha=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
export async function importEdition(file,progress=()=>{}) {
  const header=await file.slice(0,20).arrayBuffer();
  if(header.byteLength!==20||new TextDecoder().decode(header.slice(0,8))!=='PESHIT01') throw Error('Elige Mi-edicion.peshitta de la carpeta de instalación.');
  const v=new DataView(header), lengths=[8,12,16].map(offset=>v.getUint32(offset));
  if(lengths.some(n=>!n)||20+lengths.reduce((a,b)=>a+b,0)!==file.size) throw Error('El archivo está incompleto. Vuelve a copiarlo desde el paquete.');
  const response=await fetch(new URL('./edicion-huellas.json',import.meta.url));
  if(!response.ok) throw Error('No se pudo abrir la ficha de esta edición.');
  const expected=await response.json();
  const chunks=[];let pos=20;
  for(let i=0;i<3;i++) {
    progress(['Comprobando el texto…','Comprobando el índice de páginas…','Comprobando el PDF original…'][i]);
    const piece=file.slice(pos,pos+lengths[i],i===2?'application/pdf':'application/json');
    if(await sha(piece)!==expected.hashes[i]) throw Error('La huella de la edición no coincide. Usa el archivo original del paquete.');
    chunks.push(piece);pos+=lengths[i];
  }
  const corpus=JSON.parse(await chunks[0].text());
  if(corpus.source.sha256!==expected.hashes[2]||!corpus.books?.length) throw Error('El índice y el PDF pertenecen a ediciones distintas.');
  const pages=JSON.parse(await chunks[1].text());
  progress('Guardando la edición en este dispositivo…');
  if(!Array.isArray(Array.isArray(pages)?pages:pages.pages))throw Error('La edición no contiene un índice de páginas válido.');
  // Store the two exact UTF-8 byte streams to keep mobile disk usage close to
  // the size of the source file and avoid structured-clone expansion of 31k rows.
  try {
    const files=[];
    for(const chunk of chunks) files.push(new Blob([await chunk.arrayBuffer()],{type:chunk.type}));
    await writeMany('edicion',[['corpus',files[0]],['pages',files[1]],['pdf',files[2]],['hash',expected.hashes[2]]]);
  } catch(error) {
    if(error?.name==='QuotaExceededError')throw Error('Falta espacio para esta edición. Libera espacio en el teléfono y vuelve a importarla.');
    throw error;
  }
  return corpus;
}
