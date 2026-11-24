// All tabs and the service worker share IndexedDB transactions. Personal data is
// separate from the immutable source and the device-specific push credentials.
const basePath=new URL('.',import.meta.url).pathname;
export const databaseName='biblia-peshitta-v1'+(basePath==='/'?'':':'+basePath);
let connection;
function db() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      for (const name of ['edicion', 'usuario', 'dispositivo']) request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = null; };
      resolve(request.result);
    };
    request.onerror = () => { connection = null; reject(request.error); };
  });
  return connection;
}
export async function read(store, key) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => {
      const result=request.result;
      if(store==='edicion' && (key==='corpus'||key==='pages') && (result instanceof Blob||result instanceof ArrayBuffer)) {
        const contenido=result instanceof Blob ? result.text() : Promise.resolve(new TextDecoder().decode(result));
        contenido.then(text=>JSON.parse(text)).then(resolve,reject);
      } else if(store==='edicion' && key==='pdf' && result instanceof ArrayBuffer) {
        resolve(new Blob([result],{type:'application/pdf'}));
      } else resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}
export async function writeMany(store, entries) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    const bucket = tx.objectStore(store);
    for (const [key,value] of entries) {
      if (value === undefined) bucket.delete(key);
      else bucket.put(value, key);
    }
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || Error('No se pudo guardar en este dispositivo.'));
    tx.onerror = () => {};
  });
}
export async function change(store, key, update) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    const bucket = tx.objectStore(store);
    const request = bucket.get(key);
    let value;
    request.onsuccess = () => {
      try { value = update(request.result); bucket.put(value, key); }
      catch(error) { tx.abort(); reject(error); }
    };
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error || Error('No se pudo guardar el cambio.'));
    tx.onerror = () => {};
  });
}
