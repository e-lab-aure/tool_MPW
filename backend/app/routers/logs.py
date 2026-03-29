"""
WebSocket pour le streaming temps reel des logs d'un conteneur Podman.
Utilise l'API Docker compat qui retourne un flux multiplexe (stdout/stderr).
"""

import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.services.podman import get_streaming_client, parse_multiplexed_stream
from app.utils import now, valid_container_id

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/{container_id}/logs")
async def stream_logs(
    websocket: WebSocket,
    container_id: str = Depends(valid_container_id),
    tail: int = 100,
) -> None:
    """
    Stream les logs d'un conteneur en temps reel via WebSocket.
    Envoie des objets JSON : {"stream": "stdout"|"stderr", "text": "..."}.
    Le parametre tail controle combien de lignes historiques sont chargees au demarrage.
    """
    await websocket.accept()
    logger.info(
        "[INFO] %s - logs.stream - connexion ouverte pour conteneur %s",
        now(),
        container_id[:12],
    )

    try:
        async with get_streaming_client() as client:
            async with client.stream(
                "GET",
                f"/containers/{container_id}/logs",
                params={
                    "follow": True,
                    "stdout": True,
                    "stderr": True,
                    "tail": tail,
                },
            ) as response:
                if response.status_code != 200:
                    logger.error(
                        "[ERROR] %s - logs.stream - Podman HTTP %d pour conteneur %s",
                        now(),
                        response.status_code,
                        container_id[:12],
                    )
                    await websocket.close(code=1011)
                    return

                async for entry in parse_multiplexed_stream(response):
                    await websocket.send_json(entry)

    except WebSocketDisconnect:
        logger.info(
            "[INFO] %s - logs.stream - client deconnecte du conteneur %s",
            now(),
            container_id[:12],
        )
    except Exception as exc:
        logger.error(
            "[ERROR] %s - logs.stream - erreur inattendue pour %s : %s",
            now(),
            container_id[:12],
            exc,
        )
        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass
