"""
Routes REST pour la gestion des conteneurs Podman.
Expose : liste, demarrage, arret, redemarrage.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import ActionResponse, Container
from app.services.podman import get_client, parse_container

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=list[Container])
async def list_containers() -> list[Container]:
    """
    Recupere tous les conteneurs (actifs et arretes) depuis l'API Podman.
    Retourne une liste normalisee avec ports et etat courant.
    """
    async with get_client() as client:
        response = await client.get("/containers/json", params={"all": True})

        if response.status_code != 200:
            logger.error(
                "[ERROR] %s - containers.list - Podman retourne HTTP %d",
                _now(),
                response.status_code,
            )
            raise HTTPException(
                status_code=502,
                detail="Impossible de joindre l'API Podman.",
            )

        raw_list = response.json()
        containers = [parse_container(c) for c in raw_list]
        logger.info(
            "[INFO] %s - containers.list - %d conteneurs recuperes",
            _now(),
            len(containers),
        )
        return containers


@router.post("/{container_id}/start", response_model=ActionResponse)
async def start_container(container_id: str) -> ActionResponse:
    """Demarre un conteneur arrete."""
    async with get_client() as client:
        response = await client.post(f"/containers/{container_id}/start")

    # 204 = demarre, 304 = deja en cours
    if response.status_code not in (204, 304):
        logger.error(
            "[ERROR] %s - containers.start - echec pour %s (HTTP %d)",
            _now(),
            container_id[:12],
            response.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail="Impossible de demarrer le conteneur.",
        )

    logger.info(
        "[INFO] %s - containers.start - conteneur %s demarre",
        _now(),
        container_id[:12],
    )
    return ActionResponse(status="started", container_id=container_id)


@router.post("/{container_id}/stop", response_model=ActionResponse)
async def stop_container(container_id: str) -> ActionResponse:
    """Arrete un conteneur en cours d'execution."""
    async with get_client() as client:
        response = await client.post(f"/containers/{container_id}/stop")

    # 204 = arrete, 304 = deja arrete
    if response.status_code not in (204, 304):
        logger.error(
            "[ERROR] %s - containers.stop - echec pour %s (HTTP %d)",
            _now(),
            container_id[:12],
            response.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail="Impossible d'arreter le conteneur.",
        )

    logger.info(
        "[INFO] %s - containers.stop - conteneur %s arrete",
        _now(),
        container_id[:12],
    )
    return ActionResponse(status="stopped", container_id=container_id)


@router.post("/{container_id}/restart", response_model=ActionResponse)
async def restart_container(container_id: str) -> ActionResponse:
    """Redemarre un conteneur."""
    async with get_client() as client:
        response = await client.post(f"/containers/{container_id}/restart")

    if response.status_code not in (204, 304):
        logger.error(
            "[ERROR] %s - containers.restart - echec pour %s (HTTP %d)",
            _now(),
            container_id[:12],
            response.status_code,
        )
        raise HTTPException(
            status_code=502,
            detail="Impossible de redemarrer le conteneur.",
        )

    logger.info(
        "[INFO] %s - containers.restart - conteneur %s redémarre",
        _now(),
        container_id[:12],
    )
    return ActionResponse(status="restarted", container_id=container_id)


def _now() -> str:
    """Retourne l'horodatage courant au format ISO."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
