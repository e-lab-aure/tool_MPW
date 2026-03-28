"""
Schemas Pydantic pour Master Pod Warden.
Definit les modeles de donnees echanges entre le backend et le frontend.
"""

from pydantic import BaseModel
from typing import Optional


class ContainerPort(BaseModel):
    """Representation d'un port expose par un conteneur."""

    host_ip: Optional[str] = None
    host_port: Optional[int] = None
    container_port: int
    protocol: str = "tcp"


class Container(BaseModel):
    """Representation complete d'un conteneur Podman."""

    id: str
    short_id: str
    name: str
    image: str
    status: str
    state: str
    ports: list[ContainerPort]
    created: int


class ContainerStats(BaseModel):
    """Metriques temps reel d'un conteneur (CPU, RAM, reseau)."""

    cpu_percent: float
    memory_usage: int
    memory_limit: int
    memory_percent: float
    net_input: int
    net_output: int


class LogEntry(BaseModel):
    """Entree de log avec type de flux."""

    stream: str
    text: str


class ActionResponse(BaseModel):
    """Reponse standardisee apres une action sur un conteneur."""

    status: str
    container_id: str


class ContainerMount(BaseModel):
    """Mappage de volume ou bind mount d'un conteneur."""

    type: str
    source: str
    destination: str
    mode: str
    rw: bool


class ContainerNetwork(BaseModel):
    """Reseau auquel est connecte un conteneur."""

    name: str
    ip_address: str
    gateway: str
    mac_address: str


class ContainerDetail(BaseModel):
    """Informations detaillees d'un conteneur : reseaux, montages et taille."""

    id: str
    networks: list[ContainerNetwork]
    mounts: list[ContainerMount]
    size_root_fs: int
    size_rw: int
