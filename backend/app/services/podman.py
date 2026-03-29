"""
Client HTTP async pour communiquer avec l'API Podman via socket Unix.
Utilise l'API de compatibilite Docker v1.41 supportee par Podman.
"""

import os
import struct
import logging
from collections.abc import AsyncGenerator
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Chemin de la socket Unix Podman, injectable via variable d'environnement
PODMAN_SOCKET = os.environ.get("PODMAN_SOCKET_PATH", "/run/podman/podman.sock")

# Version de l'API Docker compat utilisee (liste, actions, streams)
API_VERSION = "v1.41"

# Version de l'API native Podman (libpod) - donnees plus completes pour inspect
LIBPOD_VERSION = "v4.0.0"


def get_client(timeout: float | None = 10.0) -> httpx.AsyncClient:
    """
    Cree un client HTTP async connecte a la socket Unix Podman (API Docker compat).
    Utilise pour : liste, start/stop/restart, logs, stats.
    """
    transport = httpx.AsyncHTTPTransport(uds=PODMAN_SOCKET)
    return httpx.AsyncClient(
        transport=transport,
        base_url=f"http://podman/{API_VERSION}",
        timeout=timeout,
    )


def get_libpod_client(timeout: float | None = 10.0) -> httpx.AsyncClient:
    """
    Cree un client HTTP async connecte a l'API native Podman (libpod).
    Prefere pour les inspects : retourne des donnees completes pour tous les types
    de reseaux (bridge, slirp4netns, pasta) et inclut les metadonnees systemd.
    """
    transport = httpx.AsyncHTTPTransport(uds=PODMAN_SOCKET)
    return httpx.AsyncClient(
        transport=transport,
        base_url=f"http://podman/{LIBPOD_VERSION}/libpod",
        timeout=timeout,
    )


def get_streaming_client() -> httpx.AsyncClient:
    """
    Client HTTP sans timeout pour les streams de longue duree (logs, stats).
    """
    transport = httpx.AsyncHTTPTransport(uds=PODMAN_SOCKET)
    return httpx.AsyncClient(
        transport=transport,
        base_url=f"http://podman/{API_VERSION}",
        timeout=None,
    )


async def parse_multiplexed_stream(
    response: httpx.Response,
) -> AsyncGenerator[dict[str, str], None]:
    """
    Analyse le flux multiplexe de l'API Docker compat pour les logs.
    Format : 1 octet type de flux | 3 octets padding | 4 octets taille (big-endian) | payload.
    Yield : dictionnaire {"stream": "stdout"|"stderr", "text": "..."}
    """
    buffer = b""

    async for chunk in response.aiter_bytes():
        buffer += chunk

        # Traite tous les frames complets disponibles dans le buffer
        while len(buffer) >= 8:
            stream_type_byte = buffer[0]
            frame_size = struct.unpack(">I", buffer[4:8])[0]

            # Attend d'avoir recu la totalite du frame
            if len(buffer) < 8 + frame_size:
                break

            payload = buffer[8 : 8 + frame_size]
            buffer = buffer[8 + frame_size :]

            text = payload.decode("utf-8", errors="replace")
            stream = "stderr" if stream_type_byte == 2 else "stdout"

            if text:
                yield {"stream": stream, "text": text}


def parse_container(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Transforme une entree brute de l'API Docker compat en schema Container normalise.
    """
    ports: list[dict[str, Any]] = []

    for port_data in raw.get("Ports") or []:
        ports.append(
            {
                "host_ip": port_data.get("IP"),
                "host_port": port_data.get("PublicPort"),
                "container_port": port_data.get("PrivatePort", 0),
                "protocol": port_data.get("Type", "tcp"),
            }
        )

    raw_names: list[str] = raw.get("Names") or []
    name = raw_names[0].lstrip("/") if raw_names else "inconnu"
    container_id: str = raw.get("Id", "")

    return {
        "id": container_id,
        "short_id": container_id[:12],
        "name": name,
        "image": raw.get("Image", ""),
        "status": raw.get("Status", ""),
        "state": raw.get("State", ""),
        "ports": ports,
        "created": raw.get("Created", 0),
    }


def parse_stats(raw: dict[str, Any]) -> dict[str, float | int]:
    """
    Calcule les metriques CPU, RAM et reseau depuis la reponse brute des stats Docker compat.
    Le calcul CPU utilise le delta entre cpu_stats et precpu_stats fournis dans chaque frame.
    """
    cpu_stats = raw.get("cpu_stats", {})
    precpu_stats = raw.get("precpu_stats", {})

    cpu_delta = cpu_stats.get("cpu_usage", {}).get("total_usage", 0) - precpu_stats.get(
        "cpu_usage", {}
    ).get("total_usage", 0)

    system_delta = cpu_stats.get("system_cpu_usage", 0) - precpu_stats.get(
        "system_cpu_usage", 0
    )

    # Nombre de CPUs logiques disponibles
    num_cpus = cpu_stats.get("online_cpus") or len(
        cpu_stats.get("cpu_usage", {}).get("percpu_usage") or [1]
    )

    cpu_percent = (
        (cpu_delta / system_delta) * num_cpus * 100.0 if system_delta > 0 else 0.0
    )

    mem_stats = raw.get("memory_stats", {})
    mem_usage: int = mem_stats.get("usage", 0)
    mem_limit: int = mem_stats.get("limit", 1)
    mem_percent = (mem_usage / mem_limit * 100.0) if mem_limit > 0 else 0.0

    networks = raw.get("networks") or {}
    net_in: int = sum(n.get("rx_bytes", 0) for n in networks.values())
    net_out: int = sum(n.get("tx_bytes", 0) for n in networks.values())

    return {
        "cpu_percent": round(cpu_percent, 2),
        "memory_usage": mem_usage,
        "memory_limit": mem_limit,
        "memory_percent": round(mem_percent, 2),
        "net_input": net_in,
        "net_output": net_out,
    }
