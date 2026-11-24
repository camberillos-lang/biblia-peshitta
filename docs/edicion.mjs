import {writeMany} from './almacen.mjs';
export const sha=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');

async function recursoLocal(ruta) {
  const respuesta = await fetch(new URL(ruta, import.meta.url), {cache: 'no-store'});
  if (!respuesta.ok) throw Error('No se pudo leer la edición incluida en esta instalación.');
  return respuesta;
}

async function indiceIntegrado(archivo, huella) {
  const respuesta = await recursoLocal('./edicion/' + archivo);
  const contenido = await respuesta.blob();
  if (await sha(contenido) !== huella) throw Error('El índice de esta instalación está incompleto.');
  return JSON.parse(await contenido.text());
}

async function pdfIntegrado(fuente) {
  if (document.documentElement.dataset.plataforma === 'android') {
    const pdf = await (await recursoLocal('./edicion/original.pdf')).blob();
    if (pdf.size !== fuente.originalBytes || await sha(pdf) !== fuente.sha256) {
      throw Error('El PDF incluido no coincide con el documento original.');
    }
    return pdf;
  }
  const respuesta = await recursoLocal('./edicion/pdf.json');
  const base64 = await respuesta.json();
  if (typeof base64 !== 'string' || base64.length !== 4 * Math.ceil(fuente.originalBytes / 3)) {
    throw Error('El PDF incluido en esta instalación está incompleto.');
  }
  // Decodificar por bloques también funciona en WebKit anterior a Uint8Array.fromBase64.
  const bytes = new Uint8Array(fuente.originalBytes);
  const bloque = 64 * 1024;
  let destino = 0;
  for (let i = 0; i < base64.length; i += bloque) {
    const parte = atob(base64.slice(i, i + bloque));
    for (let j = 0; j < parte.length; j++) bytes[destino++] = parte.charCodeAt(j);
  }
  const pdf = new Blob([bytes], {type: 'application/pdf'});
  if (destino !== bytes.length || await sha(pdf) !== fuente.sha256) {
    throw Error('El PDF incluido no coincide con el documento original.');
  }
  return pdf;
}

export async function abrirEdicionIntegrada() {
  const ficha = await (await recursoLocal('./edicion-huellas.json')).json();
  const corpus = await indiceIntegrado('lectura.json', ficha.hashes[0]);
  if (corpus.source?.sha256 !== ficha.hashes[2] || !corpus.books?.length) {
    throw Error('El texto incluido no corresponde a esta edición.');
  }
  return {
    corpus,
    paginas: () => indiceIntegrado('paginas.json', ficha.hashes[1]),
    pdf: () => pdfIntegrado(corpus.source),
  };
}

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
  // Algunos WebKit no pueden guardar archivos Blob en IndexedDB. Los búferes
  // conservan los bytes de la edición y se escriben en una sola transacción.
  try {
    const files=[];
    for(const chunk of chunks) files.push(await chunk.arrayBuffer());
    await writeMany('edicion',[['corpus',files[0]],['pages',files[1]],['pdf',files[2]],['hash',expected.hashes[2]]]);
  } catch(error) {
    if(error?.name==='QuotaExceededError')throw Error('Falta espacio para esta edición. Libera espacio en el teléfono y vuelve a importarla.');
    throw error;
  }
  return corpus;
}
