"""
WebSocket pour le streaming temps reel des stats d'un conteneur Podman.
Utilise l'API Docker compat qui retourne un flux JSON (un objet par intervalle).
"""

import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.podman import get_streaming_client, parse_stats

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/{container_id}/stats")
async def stream_stats(websocket: WebSocket, container_id: str) -> None:
    """
    Stream les metriques d'un conteneur en temps reel via WebSocket.
    Envoie des objets JSON : {cpu_percent, memory_usage, memory_limit, memory_percent,
    net_input, net_output}.
    L'API Podman emet environ une mise a jour par seconde.
    """
    await websocket.accept()
    logger.info(
        "[INFO] %s - stats.stream - connexion ouverte pour conteneur %s",
        _now(),
        container_id[:12],
    )

    try:
        async with get_streaming_client() as client:
            async with client.stream(
                "GET",
                f"/containers/{container_id}/stats",
                params={"stream": True},
            ) as response:
                if response.status_code != 200:
                    logger.error(
                        "[ERROR] %s - stats.stream - Podman HTTP %d pour conteneur %s",
                        _now(),
                        response.status_code,
                        container_id[:12],
                    )
                    await websocket.close(code=1011)
                    return

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        raw = json.loads(line)
                        stats = parse_stats(raw)
                        await websocket.send_json(stats)
                    except json.JSONDecodeError as exc:
                        logger.warning(
                            "[WARNING] %s - stats.stream - ligne non-JSON ignoree : %s",
                            _now(),
                            exc,
                        )

    except WebSocketDisconnect:
        logger.info(
            "[INFO] %s - stats.stream - client deconnecte du conteneur %s",
            _now(),
            container_id[:12],
        )
    except Exception as exc:
        logger.error(
            "[ERROR] %s - stats.stream - erreur inattendue pour %s : %s",
            _now(),
            container_id[:12],
            exc,
        )
        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass


def _now() -> str:
    """Retourne l'horodatage courant au format ISO."""
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
