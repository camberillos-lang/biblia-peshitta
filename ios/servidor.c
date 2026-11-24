#include "servidor.h"
#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>

struct servidor { int sock, raiz; uint16_t puerto; };
struct cliente { struct servidor *srv; int fd; };
static pthread_mutex_t bloqueo = PTHREAD_MUTEX_INITIALIZER;
static unsigned activos = 0;

static int enviar(int fd, const void *data, size_t len) {
    const char *p = data;
    while (len) {
#ifdef MSG_NOSIGNAL
        ssize_t n = send(fd, p, len, MSG_NOSIGNAL);
#else
        ssize_t n = send(fd, p, len, 0);
#endif
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) return -1;
        p += n; len -= (size_t)n;
    }
    return 0;
}
static const char *mime(const char *ruta) {
    const char *ext = strrchr(ruta, '.');
    if (!ext) return NULL;
    static const char *tipos[][2] = {
        {".html","text/html; charset=utf-8"},{".mjs","text/javascript; charset=utf-8"},
        {".css","text/css; charset=utf-8"},{".json","application/json"},
        {".webmanifest","application/manifest+json"},{".woff2","font/woff2"},
        {".woff","font/woff"},{".png","image/png"},{".webp","image/webp"},{".txt","text/plain"}
    };
    for (unsigned i=0; i<sizeof(tipos)/sizeof(*tipos); ++i)
        if (!strcmp(ext, tipos[i][0])) return tipos[i][1];
    return NULL;
}
static void error_http(int fd, const char *estado) {
    char buf[160];
    int len = snprintf(buf,sizeof buf,"HTTP/1.1 %s\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",estado);
    enviar(fd,buf,(size_t)len);
}
static void responder(struct cliente *c) {
    char cab[8193], metodo[10], ruta[768], version[20], esperado[64];
    size_t limite = sizeof cab-1, usados=0;
    cab[0]=0;
    while (!strstr(cab,"\r\n\r\n")) {
        if (usados==limite) { error_http(c->fd,"431 Request Header Fields Too Large"); return; }
        ssize_t n=recv(c->fd,cab+usados,limite-usados,0);
        if (n<0 && errno==EINTR) continue;
        if (n<=0) return;
        usados+=(size_t)n; cab[usados]=0;
    }
    char *linea=strstr(cab,"\r\n");
    *linea=0;
    if (sscanf(cab,"%9s %767s %19s",metodo,ruta,version)!=3 ||
        (strcmp(metodo,"GET") && strcmp(metodo,"HEAD"))) {
        error_http(c->fd,"405 Method Not Allowed"); return;
    }
    snprintf(esperado,sizeof esperado,"127.0.0.1:%u",(unsigned)c->srv->puerto);
    int valido=0;
    for(char *p=linea+2; *p;) {
        char *end=strstr(p,"\r\n"); if (!end || end==p) break;
        *end=0;
        if (!strncasecmp(p,"Host:",5)) {
            char *value=p+5; while(*value==' ' || *value=='\t') value++;
            valido=!strcmp(value,esperado);
            break;
        }
        p=end+2;
    }
    if (!valido) {error_http(c->fd,"403 Forbidden");return;}
    ruta[strcspn(ruta,"?#")]=0;
    if (!strcmp(ruta,"/")) strcpy(ruta,"/index.html");
    if (ruta[0]!='/' || strstr(ruta,"/.") || strstr(ruta,"//")) {error_http(c->fd,"404 Not Found");return;}
    for(char *p=ruta;*p;p++) if (!(isalnum((unsigned char)*p) || *p=='/' || *p=='.' || *p=='-' || *p=='_')) {
        error_http(c->fd,"404 Not Found");return;
    }
    const char *tipo=mime(ruta);
    if (!tipo) {error_http(c->fd,"404 Not Found");return;}
    /* La única raíz es www dentro del bundle firmado, sin directorios modificables. */
    int file=openat(c->srv->raiz,ruta+1,O_RDONLY|O_NOFOLLOW);
    struct stat meta;
    if (file<0 || fstat(file,&meta) || !S_ISREG(meta.st_mode)) {
        if(file>=0) close(file);
        error_http(c->fd,"404 Not Found");return;
    }
    int len=snprintf(cab,sizeof cab,"HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %lld\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",tipo,(long long)meta.st_size);
    if (!enviar(c->fd,cab,(size_t)len) && !strcmp(metodo,"GET")) {
        ssize_t n;
        while((n=read(file,cab,sizeof cab))>0) if(enviar(c->fd,cab,(size_t)n)) break;
    }
    close(file);
}
static void *cliente(void *arg) {
    struct cliente *c=arg;
    responder(c);close(c->fd);free(c);
    pthread_mutex_lock(&bloqueo);activos--;pthread_mutex_unlock(&bloqueo);
    return NULL;
}
static void *atender(void *arg) {
    struct servidor *s=arg;
    for (;;) {
        int fd=accept(s->sock,NULL,NULL);
        if(fd<0){if (errno==EINTR) continue;break;}
        struct timeval espera={5,0};
        setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&espera,sizeof espera);
        setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&espera,sizeof espera);
#ifdef SO_NOSIGPIPE
        int si=1;setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&si,sizeof si);
#endif
        pthread_mutex_lock(&bloqueo);
        if(activos>=24){pthread_mutex_unlock(&bloqueo);close(fd);continue;}
        activos++;pthread_mutex_unlock(&bloqueo);
        struct cliente *c=malloc(sizeof *c);pthread_t hilo;
        if(c){c->srv=s;c->fd=fd;if(!pthread_create(&hilo,NULL,cliente,c)){pthread_detach(hilo);continue;}free(c);}
        close(fd);pthread_mutex_lock(&bloqueo);activos--;pthread_mutex_unlock(&bloqueo);
    }
    return NULL;
}
int bp_iniciar(const char *carpeta, uint16_t puerto) {
    int raiz=open(carpeta,O_RDONLY|O_DIRECTORY); if(raiz<0) return -1;
    int sock=socket(AF_INET,SOCK_STREAM,0);
    if(sock<0){close(raiz);return -1;}
    int si=1;
    setsockopt(sock,SOL_SOCKET,SO_REUSEADDR,&si,sizeof si);
    struct sockaddr_in dir={0};dir.sin_family=AF_INET;dir.sin_port=htons(puerto);dir.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
#ifdef __APPLE__
    dir.sin_len=sizeof dir;
#endif
    socklen_t tam=sizeof dir;
    struct servidor *s=NULL;
    if(bind(sock,(struct sockaddr *)&dir,sizeof dir) || listen(sock,32) || getsockname(sock,(struct sockaddr *)&dir,&tam)) goto fallo;
    s=malloc(sizeof *s);if(!s) goto fallo;
    s->sock=sock;s->raiz=raiz;s->puerto=ntohs(dir.sin_port);
    pthread_t hilo;
    int e=pthread_create(&hilo,NULL,atender,s);
    if(e){errno=e;goto fallo;}
    pthread_detach(hilo);return (int)s->puerto;
fallo:
    { int e=errno;free(s);close(sock);close(raiz);errno=e;return -1; }
}
