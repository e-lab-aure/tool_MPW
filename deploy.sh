#!/bin/bash
# deploy.sh - Deploiement de Master Pod Warden
# Ce script reconstruit et relance les conteneurs MPW depuis zero.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_PREFIX="[MPW]"

log()  { echo "${LOG_PREFIX} $(date '+%Y-%m-%d %H:%M:%S') - $*"; }
error(){ echo "${LOG_PREFIX} $(date '+%Y-%m-%d %H:%M:%S') - ERREUR : $*" >&2; }

cd "${PROJECT_DIR}"

# --- Verification du fichier .env ---
if [[ ! -f .env ]]; then
    error "Fichier .env manquant. Copier .env.example en .env et renseigner PODMAN_SOCKET_PATH_HOST."
    exit 1
fi

# --- Verification de la socket Podman ---
SOCKET_PATH="$(grep PODMAN_SOCKET_PATH_HOST .env | cut -d= -f2 | tr -d ' ')"
if [[ ! -S "${SOCKET_PATH}" ]]; then
    error "Socket Podman introuvable : ${SOCKET_PATH}"
    error "Lancer : systemctl --user enable --now podman.socket"
    exit 1
fi

log "Socket Podman detectee : ${SOCKET_PATH}"

# --- Arret et suppression des conteneurs existants ---
log "Arret des conteneurs MPW existants..."
podman-compose down --remove-orphans 2>/dev/null || true

# --- Suppression des anciennes images pour forcer la reconstruction ---
log "Suppression des anciennes images MPW..."
podman rmi mpw-backend mpw-frontend 2>/dev/null || true

# --- Build et demarrage ---
log "Construction et demarrage des conteneurs..."
podman-compose up --build -d

# --- Attente du healthcheck backend ---
log "Verification du backend..."
RETRIES=15
until podman inspect mpw-backend --format '{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy"; do
    RETRIES=$((RETRIES - 1))
    if [[ ${RETRIES} -le 0 ]]; then
        error "Le backend ne repond pas apres 15 tentatives."
        podman logs mpw-backend --tail 30
        exit 1
    fi
    sleep 2
done

# --- Statut final ---
log "Deploiement termine avec succes."
log "Interface disponible sur : http://$(hostname -I | awk '{print $1}'):9090"
echo ""
podman-compose ps
