"""
Utilitaires partages pour les routeurs de Master Pod Warden.
Centralise le formateur d'horodatage et la validation des identifiants de conteneurs.
"""

import re
from datetime import datetime, timezone

from fastapi import HTTPException, Path

# Accepte les IDs hexadecimaux (12 a 64 chars) et les noms de conteneurs valides.
# Un identifiant valide commence par un caractere alphanum et peut contenir
# des tirets, underscores et points, mais aucun separateur de chemin.
_CONTAINER_ID_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.\-]{0,251}$")


def now() -> str:
    """Retourne l'horodatage courant au format YYYY-MM-DD HH:MM:SS (UTC)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def valid_container_id(container_id: str = Path(...)) -> str:
    """
    Dependance FastAPI qui valide le format d'un identifiant de conteneur.

    Accepte les IDs hexadecimaux (12-64 chars) et les noms de conteneurs.
    Leve HTTP 400 si l'identifiant contient des caracteres interdits.

    Cette validation empeche toute tentative d'injection de chemin ou
    d'exploitation de l'API Podman via un identifiant malveillant.
    """
    if not container_id or len(container_id) > 253:
        raise HTTPException(
            status_code=400,
            detail="Identifiant de conteneur invalide : longueur incorrecte.",
        )
    if not _CONTAINER_ID_RE.match(container_id):
        raise HTTPException(
            status_code=400,
            detail="Identifiant de conteneur invalide : caracteres non autorises.",
        )
    return container_id
