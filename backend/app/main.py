"""
Point d'entree principal de l'API Master Pod Warden.
Configure FastAPI, les middlewares CORS et monte tous les routeurs.
"""

import logging
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import containers, logs, stats
from app.services.podman import PODMAN_SOCKET, get_client, get_libpod_client

# --- Configuration du logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/var/log/mpw/backend.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


def _now() -> str:
    """Retourne l'horodatage courant au format ISO."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Verifie la connexion a la socket Podman au demarrage.
    Arrete l'application si la socket est inaccessible.
    """
    logger.info("[INFO] %s - mpw.startup - demarrage de Master Pod Warden", _now())
    logger.info(
        "[INFO] %s - mpw.startup - socket Podman : %s", _now(), PODMAN_SOCKET
    )

    try:
        async with get_client(timeout=5.0) as client:
            response = await client.get("/containers/json", params={"all": False})
            response.raise_for_status()
        logger.info(
            "[INFO] %s - mpw.startup - connexion Podman etablie avec succes", _now()
        )
    except (httpx.ConnectError, httpx.TimeoutException, FileNotFoundError) as exc:
        logger.critical(
            "[CRITICAL] %s - mpw.startup - impossible de joindre la socket Podman : %s",
            _now(),
            exc,
        )
        sys.exit(1)

    yield

    logger.info("[INFO] %s - mpw.shutdown - arret de Master Pod Warden", _now())


# --- Creation de l'application FastAPI ---
app = FastAPI(
    title="Master Pod Warden API",
    description="Interface de gestion de conteneurs Podman.",
    version="1.0.0",
    lifespan=lifespan,
    # Desactive la doc Swagger en production si necessaire
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# --- Middleware CORS ---
# Restreint aux origines du reseau local ; a affiner avec l'auth future
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# --- Montage des routeurs ---
app.include_router(
    containers.router,
    prefix="/api/containers",
    tags=["containers"],
)
app.include_router(
    logs.router,
    prefix="/api/containers",
    tags=["logs"],
)
app.include_router(
    stats.router,
    prefix="/api/containers",
    tags=["stats"],
)


@app.get("/api/health", tags=["health"])
async def health() -> dict[str, str]:
    """
    Endpoint de sante pour les health checks du compose.
    Inclut la version de Podman et les capacites supportees.
    """
    podman_version = "unknown"
    restart_policy_editable = False

    try:
        async with get_libpod_client(timeout=5.0) as client:
            resp = await client.get("/version")
            if resp.status_code == 200:
                data = resp.json()
                podman_version = (
                    data.get("Version")
                    or data.get("Components", [{}])[0].get("Version", "unknown")
                )
                # La modification de RestartPolicy via l'API est supportee a partir de
                # Podman 5.0.0. En dessous, l'appel reussit mais est silencieusement ignore.
                parts = podman_version.split(".")
                major = int(parts[0]) if parts and parts[0].isdigit() else 0
                restart_policy_editable = major >= 5
    except Exception:
        pass

    return {
        "status": "ok",
        "service": "Master Pod Warden",
        "podman_version": podman_version,
        "restart_policy_editable": str(restart_policy_editable).lower(),
    }
