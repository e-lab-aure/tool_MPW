"""
Service de generation de fichiers Quadlet pour Podman.
Un fichier Quadlet (.container) est la methode recommandee pour gerer
le demarrage automatique des conteneurs via systemd en mode rootless.
"""

from typing import Any

# Variables d'environnement injectees automatiquement par Podman ou le kernel :
# on les exclut du fichier Quadlet pour ne pas surcharger la configuration.
_ENV_DEFAULTS = frozenset({"PATH", "HOME", "TERM", "HOSTNAME", "container"})

# Noms de reseaux internes a Podman qui ne sont pas configurables via Quadlet.
_EXCLUDED_NETWORKS = frozenset({"pasta", "slirp4netns", "host", "none", "bridge", "default"})


def generate_quadlet(raw: dict[str, Any]) -> tuple[str, str, str]:
    """
    Genere le contenu d'un fichier Quadlet a partir des donnees brutes d'un inspect libpod.

    Retourne un tuple (content, filename, install_path) ou :
      - content      : contenu complet du fichier .container
      - filename     : nom du fichier (ex: myapp.container)
      - install_path : chemin recommande (ex: ~/.config/containers/systemd/myapp.container)
    """
    config: dict = raw.get("Config") or {}
    host_config: dict = raw.get("HostConfig") or {}

    # Nom du conteneur sans le slash initial (format Podman inspect)
    name: str = (raw.get("Name") or "").lstrip("/") or "container"

    # Image telle qu'elle a ete utilisee au demarrage (tag ou digest inclus)
    image: str = config.get("Image") or raw.get("Image") or ""

    env_lines = _parse_env(config)
    port_lines = _parse_ports(host_config)
    volume_lines = _parse_volumes(raw)
    network_lines = _parse_networks(raw)

    content = _build_content(name, image, env_lines, port_lines, volume_lines, network_lines)
    filename = f"{name}.container"
    install_path = f"~/.config/containers/systemd/{filename}"

    return content, filename, install_path


def _parse_env(config: dict) -> list[str]:
    """
    Extrait les variables d'environnement non-systeme de la configuration du conteneur.
    Filtre les variables standard injectees par Podman (PATH, HOME, TERM, etc.).
    """
    lines: list[str] = []
    for env_str in config.get("Env") or []:
        if "=" in env_str:
            key = env_str.split("=", 1)[0]
            if key not in _ENV_DEFAULTS:
                lines.append(f"Environment={env_str}")
    return lines


def _parse_ports(host_config: dict) -> list[str]:
    """
    Construit les directives PublishPort depuis les liaisons de ports de l'hote.
    Format Quadlet : PublishPort=[ip:]host_port:container_port/proto
    """
    lines: list[str] = []
    port_bindings: dict = host_config.get("PortBindings") or {}
    for container_port_proto, host_bindings in port_bindings.items():
        if not host_bindings:
            continue
        for binding in host_bindings:
            host_ip: str = binding.get("HostIp") or ""
            host_port: str = binding.get("HostPort") or ""
            if host_ip and host_ip not in ("0.0.0.0", "::"):
                lines.append(f"PublishPort={host_ip}:{host_port}:{container_port_proto}")
            else:
                lines.append(f"PublishPort={host_port}:{container_port_proto}")
    return lines


def _parse_volumes(raw: dict) -> list[str]:
    """
    Construit les directives Volume depuis les montages du conteneur.
    Inclut les volumes nommes et les bind mounts, en preservant le mode rw/ro.
    """
    lines: list[str] = []
    for mount in raw.get("Mounts") or []:
        m_type: str = mount.get("Type", "bind")
        source: str = mount.get("Source", "")
        dest: str = mount.get("Destination", "")
        mode: str = "rw" if mount.get("RW", True) else "ro"
        if m_type in ("bind", "volume") and source and dest:
            lines.append(f"Volume={source}:{dest}:{mode}")
    return lines


def _parse_networks(raw: dict) -> list[str]:
    """
    Construit les directives Network pour les reseaux Podman nommes.
    Exclut les modes reseau internes (pasta, slirp4netns, host, none, bridge, default)
    qui ne sont pas des reseaux Podman configurables via Quadlet.
    """
    net_settings: dict = raw.get("NetworkSettings") or {}
    raw_networks: dict = net_settings.get("Networks") or {}
    return [
        f"Network={net_name}"
        for net_name in raw_networks
        if net_name.lower() not in _EXCLUDED_NETWORKS
    ]


def _build_content(
    name: str,
    image: str,
    env_lines: list[str],
    port_lines: list[str],
    volume_lines: list[str],
    network_lines: list[str],
) -> str:
    """
    Assemble les sections du fichier Quadlet dans l'ordre canonique :
    [Unit] -> [Container] -> [Service] -> [Install].
    """
    sections: list[str] = []

    sections.append("[Unit]")
    sections.append(f"Description=Podman container - {name}")
    sections.append("After=network-online.target")
    sections.append("")

    sections.append("[Container]")
    sections.append(f"Image={image}")
    sections.append(f"ContainerName={name}")

    if env_lines:
        sections.extend(env_lines)
    if port_lines:
        sections.extend(port_lines)
    if volume_lines:
        sections.extend(volume_lines)
    if network_lines:
        sections.extend(network_lines)

    sections.append("")
    sections.append("[Service]")
    sections.append("Restart=always")
    sections.append("TimeoutStartSec=300")
    sections.append("")

    sections.append("[Install]")
    sections.append("WantedBy=default.target")

    return "\n".join(sections)
