"""Conector local de prueba para Hikvision ISAPI.
Solo escucha en 127.0.0.1; no expone el servicio a la red de la oficina.
No guarda credenciales ni plantillas biométricas.
"""
from ipaddress import ip_address
from xml.etree import ElementTree
from urllib.parse import urlunparse

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from requests.auth import HTTPDigestAuth

app = FastAPI(title="Conector local Intersat", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

class HikvisionTest(BaseModel):
    ip: str
    port: int = Field(default=80, ge=1, le=65535)
    username: str
    password: str

@app.get("/api/status")
def status():
    return {"ok": True, "message": "Conector local activo en esta laptop."}

@app.post("/api/hikvision/test")
def test_hikvision(data: HikvisionTest):
    try:
        host = str(ip_address(data.ip.strip()))
    except ValueError:
        raise HTTPException(status_code=400, detail="La dirección IP no es válida.")

    if not data.username.strip() or not data.password:
        raise HTTPException(status_code=400, detail="Falta el usuario o la contraseña.")

    url = urlunparse(("http", f"{host}:{data.port}", "/ISAPI/System/deviceInfo", "", "", ""))
    try:
        response = requests.get(
            url,
            auth=HTTPDigestAuth(data.username.strip(), data.password),
            timeout=7,
            verify=False,
            headers={"Accept": "application/xml"},
        )
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="El captahuellas no respondió en 7 segundos.")
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo alcanzar el equipo: {exc}")

    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="El equipo respondió, pero rechazó las credenciales o el permiso ISAPI.")
    if not response.ok:
        raise HTTPException(status_code=response.status_code, detail=f"El Hikvision respondió HTTP {response.status_code}.")

    try:
        root = ElementTree.fromstring(response.content)
        values = {}
        for node in root.iter():
            tag = node.tag.split("}")[-1]
            if node.text and node.text.strip():
                values[tag] = node.text.strip()
    except ElementTree.ParseError:
        raise HTTPException(status_code=502, detail="El equipo respondió, pero la respuesta no fue XML válido.")

    return {
        "ok": True,
        "model": values.get("model"),
        "deviceName": values.get("deviceName"),
        "serialNumber": values.get("serialNumber"),
        "firmwareVersion": values.get("firmwareVersion"),
        "message": "Respuesta ISAPI recibida correctamente.",
    }
