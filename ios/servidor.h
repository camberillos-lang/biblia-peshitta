#ifndef PESHITTA_HTTP_H
#define PESHITTA_HTTP_H
#include <stdint.h>
/* Inicia un servidor de recursos empotrados en la interfaz IPv4 de loopback.
   Devuelve el puerto real (0 pide uno disponible) o -1 con errno. */
int bp_iniciar(const char *carpeta, uint16_t puerto);
#endif
