"""
Routes REST pour la gestion des conteneurs Podman.
Expose : liste, inspection, demarrage, arret, redemarrage, autostart.
"""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ActionResponse,
    AutostartEntry,
    AutostartUpdate,
    Container,
    ContainerDetail,
    ContainerMount,
    ContainerNetwork,
)
from app.services.podman import get_client, get_libpod_client, parse_container

logger = logging.getLogger(__name__)
router = APIRouter()


def _now() -> str:
    """Retourne l'horodatage courant au format ISO."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


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


@router.get("/autostart", response_model=list[AutostartEntry])
async def get_autostart_policies() -> list[AutostartEntry]:
    """
    Retourne la politique de demarrage automatique de tous les conteneurs.
    Effectue les inspects en parallele via asyncio.gather pour minimiser la latence.
    Une politique "always" signifie que le conteneur redemarrera automatiquement.
    """
    # Recuperer la liste via Docker compat, puis inspecter via libpod pour les details
    async with get_client(timeout=15.0) as list_client:
        list_response = await list_client.get("/containers/json", params={"all": True})

        if list_response.status_code != 200:
            logger.error(
                "[ERROR] %s - containers.autostart - Podman retourne HTTP %d",
                _now(),
                list_response.status_code,
            )
            raise HTTPException(
                status_code=502,
                detail="Impossible de joindre l'API Podman.",
            )

        container_ids: list[str] = [c["Id"] for c in list_response.json()]

    async def _inspect_policy(cid: str) -> AutostartEntry:
        """
        Detecte la politique de demarrage automatique d'un conteneur.
        Deux mecanismes sont reconnus :
          1. RestartPolicy "always" : configure via --restart=always
          2. Label PODMAN_SYSTEMD_UNIT : conteneur gere par une unite systemd
             (quadlet ou podman generate systemd)
        """
        async with get_libpod_client(timeout=10.0) as client:
            resp = await client.get(f"/containers/{cid}/json")

        if resp.status_code != 200:
            return AutostartEntry(id=cid, restart_policy="no", mechanism="none")

        raw = resp.json()

        # Verification via RestartPolicy
        policy: str = (
            (raw.get("HostConfig") or {})
            .get("RestartPolicy", {})
            .get("Name") or "no"
        )

        # Verification via label systemd (quadlet / podman generate systemd)
        labels: dict = (raw.get("Config") or {}).get("Labels") or {}
        if "PODMAN_SYSTEMD_UNIT" in labels:
            return AutostartEntry(id=cid, restart_policy="always", mechanism="systemd")

        if policy == "always":
            return AutostartEntry(id=cid, restart_policy="always", mechanism="restart_policy")

        return AutostartEntry(id=cid, restart_policy="no", mechanism="none")

    results = await asyncio.gather(*[_inspect_policy(cid) for cid in container_ids])

    logger.info(
        "[INFO] %s - containers.autostart - politiques recuperees pour %d conteneurs",
        _now(),
        len(results),
    )
    return list(results)


@router.post("/{container_id}/autostart", response_model=ActionResponse)
async def set_autostart(container_id: str, body: AutostartUpdate) -> ActionResponse:
    """
    Active ou desactive le demarrage automatique d'un conteneur.
    Utilise l'API libpod native (le endpoint Docker compat /update ne supporte
    pas la modification de RestartPolicy dans Podman).
    - enabled=True  -> RestartPolicy "always"
    - enabled=False -> RestartPolicy "no"
    """
    policy_name = "always" if body.enabled else "no"

    async with get_libpod_client() as client:
        response = await client.post(
            f"/containers/{container_id}/update",
            json={"RestartPolicy": {"Name": policy_name, "MaximumRetryCount": 0}},
        )

    if response.status_code not in (200, 201, 204):
        logger.error(
            "[ERROR] %s - containers.autostart - echec update pour %s (HTTP %d) : %s",
            _now(),
            container_id[:12],
            response.status_code,
            response.text[:200],
        )
        raise HTTPException(
            status_code=502,
            detail="Impossible de modifier la politique de demarrage.",
        )

    action = "autostart_enabled" if body.enabled else "autostart_disabled"
    logger.info(
        "[INFO] %s - containers.autostart - conteneur %s : RestartPolicy -> %s",
        _now(),
        container_id[:12],
        policy_name,
    )
    return ActionResponse(status=action, container_id=container_id)


@router.get("/{container_id}/inspect", response_model=ContainerDetail)
async def inspect_container(container_id: str) -> ContainerDetail:
    """
    Retourne les details complets d'un conteneur : reseaux, montages et taille.
    Utilise l'API libpod native pour obtenir des donnees reseau completes,
    notamment pour les reseaux par defaut (podman), slirp4netns et pasta.
    """
    async with get_libpod_client(timeout=15.0) as client:
        response = await client.get(
            f"/containers/{container_id}/json",
            params={"size": 1},
        )

    if response.status_code != 200:
        logger.error(
            "[ERROR] %s - containers.inspect - Podman HTTP %d pour %s",
            _now(),
            response.status_code,
            container_id[:12],
        )
        raise HTTPException(
            status_code=502,
            detail="Impossible d'inspecter le conteneur.",
        )

    raw = response.json()

    # --- Reseaux ---
    # Priorite 1 : NetworkSettings.Networks (format Docker compat + libpod bridge)
    # Priorite 2 : NetworkSettings top-level (format slirp4netns / conteneurs anciens)
    networks: list[ContainerNetwork] = []
    net_settings: dict = raw.get("NetworkSettings") or {}
    raw_networks: dict = net_settings.get("Networks") or {}

    if raw_networks:
        for net_name, net_data in raw_networks.items():
            networks.append(
                ContainerNetwork(
                    name=net_name,
                    ip_address=net_data.get("IPAddress") or "",
                    gateway=net_data.get("Gateway") or "",
                    mac_address=net_data.get("MacAddress") or "",
                )
            )
    else:
        # Fallback pour les conteneurs rootless sans reseau bridge explicite :
        # l'IP et la gateway sont directement dans NetworkSettings
        flat_ip: str = net_settings.get("IPAddress") or ""
        flat_gw: str = net_settings.get("Gateway") or ""
        flat_mac: str = net_settings.get("MacAddress") or ""
        if flat_ip or flat_gw:
            networks.append(
                ContainerNetwork(
                    name="default",
                    ip_address=flat_ip,
                    gateway=flat_gw,
                    mac_address=flat_mac,
                )
            )

    # --- Montages (volumes et bind mounts) ---
    mounts: list[ContainerMount] = []
    for m in raw.get("Mounts") or []:
        mounts.append(
            ContainerMount(
                type=m.get("Type", "bind"),
                source=m.get("Source", ""),
                destination=m.get("Destination", ""),
                mode=m.get("Mode", "rw"),
                rw=m.get("RW", True),
            )
        )

    logger.info(
        "[INFO] %s - containers.inspect - conteneur %s inspecte (%d reseaux, %d montages)",
        _now(),
        container_id[:12],
        len(networks),
        len(mounts),
    )

    return ContainerDetail(
        id=container_id,
        networks=networks,
        mounts=mounts,
        size_root_fs=raw.get("SizeRootFs") or 0,
        size_rw=raw.get("SizeRw") or 0,
    )


@router.post("/{container_id}/start", response_model=ActionResponse)
async def start_container(container_id: str) -> ActionResponse:
    """Demarre un conteneur arrete."""
    async with get_client() as client:
        response = await client.post(f"/containers/{container_id}/start")

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
        "[INFO] %s - containers.restart - conteneur %s redemarre",
        _now(),
        container_id[:12],
    )
    return ActionResponse(status="restarted", container_id=container_id)
