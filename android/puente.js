(() => {
  'use strict';
  let conectar;
  let siguiente = 0;
  const peticiones = new Map();
  const conexion = new Promise(resolver => { conectar = resolver; });
  window.addEventListener('message', evento => {
    if (evento.data !== 'peshitta-puerto' || evento.ports.length !== 1) return;
    const puerto = evento.ports[0];
    puerto.onmessage = respuesta => {
      const mensaje = JSON.parse(respuesta.data);
      const peticion = peticiones.get(mensaje.id);
      if (!peticion) return;
      peticiones.delete(mensaje.id);
      if (mensaje.error) peticion.rechazar(Error(mensaje.error));
      else peticion.resolver(mensaje.valor);
    };
    conectar(puerto);
  });
  window.peshittaAndroid = Object.freeze({
    async postMessage(datos) {
      const puerto = await conexion;
      return new Promise((resolver, rechazar) => {
        const id = ++siguiente;
        peticiones.set(id, {resolver, rechazar});
        try { puerto.postMessage(JSON.stringify({id, ...datos})); }
        catch (error) { peticiones.delete(id); rechazar(error); }
      });
    }
  });
})();
