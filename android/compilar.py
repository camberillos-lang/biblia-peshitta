"""Genera un APK personal firmado a partir del lector y de Mi-edicion.peshitta."""
import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ANDROID = Path(__file__).resolve().parent
DOCS = ANDROID.parent / 'docs'


def preparar(archivo, carpeta):
    shutil.copytree(DOCS, carpeta)
    ficha = json.loads((carpeta / 'edicion-huellas.json').read_bytes())
    with archivo.open('rb') as fuente:
        cabecera = fuente.read(20)
        if len(cabecera) != 20 or cabecera[:8] != b'PESHIT01':
            raise ValueError('Elige la edición personal de Biblia Peshitta.')
        tamanos = struct.unpack('>III', cabecera[8:])
        if sum(tamanos) + 20 != archivo.stat().st_size or not all(tamanos):
            raise ValueError('El paquete de la edición está incompleto.')
        (carpeta / 'edicion').mkdir(exist_ok=True)
        for nombre, n, huella in zip(('lectura.json', 'paginas.json', 'original.pdf'), tamanos, ficha['hashes'], strict=True):
            datos = fuente.read(n)
            if hashlib.sha256(datos).hexdigest() != huella:
                raise ValueError('La edición no coincide con el original.')
            (carpeta / 'edicion' / nombre).write_bytes(datos)

    lectura = json.loads((carpeta / 'edicion/lectura.json').read_bytes())
    indice = [
        {'nombre': libro['name'], 'capitulos': [[c['n'], c['p']] for c in libro['chapters']]}
        for libro in lectura['books']
    ]
    (carpeta / 'edicion/indice-android.json').write_text(
        json.dumps(indice, ensure_ascii=False), encoding='utf-8')

    inicio = carpeta / 'index.html'
    texto = inicio.read_text(encoding='utf-8')
    original = '<html lang="es-MX">'
    if texto.count(original) != 1 or texto.count('</head>') != 1:
        raise ValueError('No se pudo identificar la página inicial del lector.')
    texto = texto.replace(original, '<html lang="es-MX" data-edicion="integrada" data-plataforma="android">')
    inicio.write_text(texto.replace('</head>', '  <script src="./puente.js"></script>\n</head>'), encoding='utf-8')
    shutil.copyfile(ANDROID / 'puente.js', carpeta / 'puente.js')


def ejecutar(*args):
    subprocess.run([str(a) for a in args], check=True)


def herramientas(sdk):
    jar = sdk / 'platforms/android-35/android.jar'
    utiles = sdk / 'build-tools/35.0.1'
    if not jar.is_file() or not utiles.is_dir():
        raise FileNotFoundError('Se requiere Android SDK 35 con Build Tools 35.0.1.')
    return jar, utiles


def codigo(fuentes, trabajo, jar, utiles):
    clases = trabajo / 'clases'
    clases.mkdir()
    javac = shutil.which('javac')
    compilador = [javac] if javac else ['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main']
    ejecutar(*compilador, '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-bootclasspath',
             str(jar) + os.pathsep + str(utiles / 'core-lambda-stubs.jar'), '-d', clases, *fuentes)
    paquete = trabajo / 'clases.jar'
    with ZipFile(paquete, 'w', ZIP_DEFLATED) as z:
        for f in sorted(clases.rglob('*.class')):
            z.write(f, f.relative_to(clases).as_posix())
    dex = trabajo / 'dex'
    dex.mkdir()
    ejecutar(utiles / 'd8', '--release', '--min-api', '26', '--lib', jar, '--output', dex, paquete)
    return dex / 'classes.dex'


def firmar(trabajo, enlazado, dex, salida, utiles, clave, certificado):
    with ZipFile(enlazado, 'a', ZIP_DEFLATED) as z:
        z.write(dex, 'classes.dex')
    alineado = trabajo / 'alineado.apk'
    firmado = trabajo / 'firmado.apk'
    ejecutar(utiles / 'zipalign', '-f', '4', enlazado, alineado)
    ejecutar(utiles / 'apksigner', 'sign', '--key', clave, '--cert', certificado,
             '--v4-signing-enabled', 'false', '--out', firmado, alineado)
    ejecutar(utiles / 'apksigner', 'verify', '--verbose', firmado)
    ejecutar(utiles / 'zipalign', '-c', '4', firmado)
    firmado.replace(salida)


def construir(sdk, edicion, clave, certificado, salida):
    jar, utiles = herramientas(sdk)
    salida.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=salida.parent) as tmp:
        trabajo = Path(tmp)
        preparar(edicion, trabajo / 'assets/lector')
        res = trabajo / 'res'
        shutil.copytree(ANDROID / 'res', res)
        icono = res / 'drawable-xxxhdpi/icono.png'
        icono.parent.mkdir()
        shutil.copyfile(DOCS / 'assets/icon-192.png', icono)
        comp = trabajo / 'recursos.zip'
        enlace = trabajo / 'recursos.apk'
        gen = trabajo / 'generado'
        gen.mkdir()
        ejecutar(utiles / 'aapt2', 'compile', '--dir', res, '-o', comp)
        ejecutar(utiles / 'aapt2', 'link', '-I', jar, '--manifest', ANDROID / 'AndroidManifest.xml',
                 '--java', gen, '-A', trabajo / 'assets', '-0', 'pdf', '-o', enlace, comp)
        fuentes = sorted((ANDROID / 'java').rglob('*.java')) + sorted(gen.rglob('*.java'))
        dex = codigo(fuentes, trabajo, jar, utiles)
        firmar(trabajo, enlace, dex, salida, utiles, clave, certificado)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for campo in ('sdk', 'edicion', 'clave', 'certificado', 'salida'):
        p.add_argument(campo, type=Path)
    a = p.parse_args()
    construir(*(p.resolve() for p in (a.sdk, a.edicion, a.clave, a.certificado, a.salida)))
    print(a.salida)
