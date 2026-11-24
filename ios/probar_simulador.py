"""Abre la aplicación en un iPhone simulado y verifica la vista inicial y el puente nativo."""
import json
import subprocess
import time
from pathlib import Path
from compilar import construir


def sim(*args, captura=False):
    proc=subprocess.run(["xcrun","simctl",*map(str,args)], check=True, text=True, stdout=subprocess.PIPE if captura else None)
    return proc.stdout.strip() if captura else None


def main():
    app=construir(simulador=True)
    subprocess.run(["codesign","--force","--sign","-",str(app)],check=True)
    devices=json.loads(sim("list","devices","available","-j",captura=True))["devices"]
    grupos=[(k,v) for k,v in devices.items() if "SimRuntime.iOS-" in k]
    grupos.sort(key=lambda x:[int(n) for n in x[0].split(".iOS-")[-1].split("-")],reverse=True)
    iphone=next(d for _,group in grupos for d in group if d.get("isAvailable") and d["name"].startswith("iPhone"))
    uuid=iphone["udid"]
    if iphone["state"]!="Booted":sim("boot",uuid)
    sim("bootstatus",uuid,"-b")
    sim("install",uuid,app)
    bundle="org.bibliapeshitta.lectura"
    contenedor=Path(sim("get_app_container",uuid,bundle,"data",captura=True))
    testigo=contenedor/"Documents/arranque-qa.txt"
    testigo.unlink(missing_ok=True)
    sim("launch",uuid,bundle,"--comprobar-lector")
    for _ in range(100):
        if testigo.is_file():
            estado=testigo.read_text()
            if estado!="LISTO":raise RuntimeError(estado)
            print("La app arrancó en",iphone["name"],"con lectura local, IndexedDB y comunicación con iOS.")
            return
        time.sleep(1)
    raise RuntimeError("El lector no confirmó su arranque en el simulador.")


if __name__ == "__main__":
    main()

