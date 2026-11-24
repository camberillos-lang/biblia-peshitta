"""Integra una edición personal en el IPA sin firmar que produce compilar.py."""

import argparse
import base64
from copy import copy
import hashlib
import json
import plistlib
import struct
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


DOCS = Path(__file__).resolve().parents[1] / 'docs'
APP = 'Payload/BibliaPeshitta.app/'


def dividir_edicion(archivo, ficha):
    with archivo.open('rb') as fuente:
        cabecera = fuente.read(20)
        if len(cabecera) != 20 or cabecera[:8] != b'PESHIT01':
            raise ValueError('El archivo no es una edición Peshitta válida.')
        tamanos = struct.unpack('>III', cabecera[8:])
        if not all(tamanos) or sum(tamanos) + 20 != archivo.stat().st_size:
            raise ValueError('La edición está incompleta.')
        partes = [fuente.read(n) for n in tamanos]
    if [hashlib.sha256(p).hexdigest() for p in partes] != ficha['hashes']:
        raise ValueError('La edición no corresponde al documento de esta app.')
    return partes


def integrar(base, edicion, destino, version=None):
    if destino.resolve() == base.resolve():
        raise ValueError('Elige una ruta de salida distinta del IPA base.')
    destino.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(base) as original:
        info = plistlib.loads(original.read(APP + 'Info.plist'))
        if info['CFBundleIdentifier'] != 'org.bibliapeshitta.lectura' or info['CFBundleSupportedPlatforms'] != ['iPhoneOS']:
            raise ValueError('La base debe ser el IPA para iPhone de Biblia Peshitta.')
        if APP + '_CodeSignature/CodeResources' in original.namelist():
            raise ValueError('Usa el IPA sin firmar de la compilación.')
        documento = json.loads(original.read(APP + 'docs/edicion-huellas.json'))
        corpus, paginas, pdf = dividir_edicion(edicion, documento)
        fuente = json.loads(corpus)['source']
        if fuente['sha256'] != documento['hashes'][2] or fuente['originalBytes'] != len(pdf):
            raise ValueError('El índice de lectura y el PDF no coinciden.')

        # El servidor del primer IPA sirve JSON. Esta representación también permite
        # actualizar instalaciones existentes conservando el mismo ejecutable y origen.
        recursos = {
            'docs/edicion/lectura.json': corpus,
            'docs/edicion/paginas.json': paginas,
            'docs/edicion/pdf.json': b'"' + base64.b64encode(pdf) + b'"',
            'docs/app.mjs': (DOCS / 'app.mjs').read_bytes(),
            'docs/almacen.mjs': (DOCS / 'almacen.mjs').read_bytes(),
            'docs/edicion.mjs': (DOCS / 'edicion.mjs').read_bytes(),
        }
        html = original.read(APP + 'docs/index.html')
        normal, integrada = b'<html lang="es-MX">', b'<html lang="es-MX" data-edicion="integrada">'
        if normal not in html and integrada not in html:
            raise ValueError('La página inicial de este IPA no es compatible.')
        recursos['docs/index.html'] = html.replace(normal, integrada, 1)
        if version:
            info['CFBundleShortVersionString'] = version
        info['CFBundleVersion'] = str(int(info['CFBundleVersion']) + 1)
        recursos['Info.plist'] = plistlib.dumps(info, fmt=plistlib.FMT_BINARY)

        with tempfile.TemporaryDirectory(dir=destino.parent) as carpeta:
            temporal = Path(carpeta) / 'integrada.ipa'
            with ZipFile(temporal, 'w', ZIP_DEFLATED, compresslevel=6) as salida:
                for entrada in original.infolist():
                    relativo = entrada.filename.removeprefix(APP)
                    if entrada.filename.startswith(APP) and relativo in recursos:
                        datos = recursos.pop(relativo)
                    else:
                        datos = original.read(entrada)
                    salida.writestr(copy(entrada), datos)
                for nombre, datos in recursos.items():
                    entrada = ZipInfo(APP + nombre, original.getinfo(APP + 'docs/index.html').date_time)
                    entrada.create_system = 3
                    entrada.external_attr = 0o100644 << 16
                    salida.writestr(entrada, datos, compress_type=ZIP_DEFLATED, compresslevel=6)
            with ZipFile(temporal) as salida:
                if salida.testzip() is not None or len(salida.namelist()) != len(set(salida.namelist())):
                    raise ValueError('El IPA de salida no está íntegro.')
                exe = APP + info['CFBundleExecutable']
                if original.read(exe) != salida.read(exe) or not (salida.getinfo(exe).external_attr >> 16) & 0o111:
                    raise ValueError('No se pudo conservar el ejecutable de iPhone.')
            temporal.replace(destino)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base', type=Path, help='IPA sin firmar de GitHub Actions o Xcode')
    parser.add_argument('edicion', type=Path, help='Paquete personal Mi-edicion.peshitta')
    parser.add_argument('destino', type=Path, help='Nuevo IPA listo para firmar en Sideloadly')
    parser.add_argument('--version', help='Versión que se mostrará en el iPhone')
    args = parser.parse_args()
    integrar(args.base, args.edicion, args.destino, args.version)
    print(args.destino)
