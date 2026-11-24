"""Construye con el Xcode del Mac donde se ejecuta. Los certificados se aplican en Sideloadly."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import hashlib
import os
import plistlib
import shutil
import subprocess

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "salida"


def construir(simulador=False):
    plataforma = "iphonesimulator" if simulador else "iphoneos"
    producto = SALIDA / plataforma
    orden = [
        "xcodebuild", "-project", str(RAIZ / "ios/BibliaPeshitta.xcodeproj"),
        "-target", "BibliaPeshitta", "-configuration", "Release", "-sdk", plataforma,
        "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "ONLY_ACTIVE_ARCH=NO",
        "CONFIGURATION_BUILD_DIR="+str(producto),
        "OBJROOT="+str(SALIDA/"intermedios"/plataforma), "SYMROOT="+str(producto), "build",
    ]
    subprocess.run(orden, cwd=RAIZ, check=True)
    app = producto / "BibliaPeshitta.app"
    with (app / "Info.plist").open("rb") as f:
        info = plistlib.load(f)
    assert info["CFBundleSupportedPlatforms"] == (["iPhoneSimulator"] if simulador else ["iPhoneOS"])
    exe = app / info["CFBundleExecutable"]
    assert exe.stat().st_size > 0 and os.access(exe, os.X_OK)
    if not simulador:
        subprocess.run(["xcrun", "lipo", str(exe), "-verify_arch", "arm64"], check=True)
    # Evita publicar un IPA si Xcode omite, aplana o transforma los recursos de lectura.
    for fuente in (RAIZ/"docs").rglob("*"):
        if fuente.is_file() and not fuente.name.startswith("."):
            interno = app / fuente.relative_to(RAIZ)
            assert interno.is_file() and hashlib.sha256(interno.read_bytes()).digest() == hashlib.sha256(fuente.read_bytes()).digest(), fuente
    assert not list(app.rglob("*.peshitta")) and not list(app.rglob("*.pdf"))
    return app


def empaquetar(app):
    ipa = SALIDA / "BibliaPeshitta-unsigned.ipa"
    temporal = ipa.with_suffix(".temporal")
    with ZipFile(temporal, "w", ZIP_DEFLATED, compresslevel=6) as z:
        for file in sorted(app.rglob("*")):
            if file.is_file():
                z.write(file, "Payload/" + app.name + "/" + file.relative_to(app).as_posix())
    with ZipFile(temporal) as z:
        assert z.testzip() is None
        exe = z.getinfo("Payload/BibliaPeshitta.app/BibliaPeshitta")
        assert (exe.external_attr >> 16) & 0o111
        assert "Payload/BibliaPeshitta.app/docs/index.html" in z.namelist()
    temporal.replace(ipa)
    print("IPA para Sideloadly:", ipa)
    return ipa


if __name__ == "__main__":
    p=argparse.ArgumentParser(description=__doc__)
    modo=p.add_mutually_exclusive_group()
    modo.add_argument("--simulador",action="store_true")
    modo.add_argument("--edicion",type=Path,metavar="ARCHIVO",help="Integra la edición personal en un IPA adicional para iPhone.")
    args=p.parse_args()
    app=construir(args.simulador)
    if not args.simulador:
        base = empaquetar(app)
        if args.edicion:
            from integrar_edicion import integrar
            destino = SALIDA / 'BibliaPeshitta-con-edicion.ipa'
            integrar(base, args.edicion, destino)
            print('IPA con la edición integrada:', destino)

