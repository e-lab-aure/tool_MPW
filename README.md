# Master Pod Warden (MPW)

> Take control of your Podman infrastructure.

Interface web temps reel pour gerer, surveiller et piloter des conteneurs Podman depuis un navigateur. MPW tourne lui-meme dans Podman via podman-compose et communique avec le daemon via la socket Unix.

---

## Sommaire

1. [Architecture](#architecture)
2. [Stack technique](#stack-technique)
3. [Structure du projet](#structure-du-projet)
4. [Installation pas-a-pas](#installation-pas-a-pas)
5. [Mise a jour](#mise-a-jour)
6. [Variables d'environnement](#variables-denvironnement)
7. [Diagnostic et logs](#diagnostic-et-logs)
8. [Problemes connus et solutions](#problemes-connus-et-solutions)
9. [Securite](#securite)
10. [Roadmap](#roadmap)

---

## Architecture

### Vue d'ensemble

```
+--------------------------------------------------+
|                    Hote Linux                    |
|                                                  |
|  systemctl --user start podman.socket            |
|  /run/user/1000/podman/podman.sock               |
|          |                                       |
|          | monte en :ro dans mpw-backend         |
|          v                                       |
|  +-----------------------------------------------+
|  |          Reseau interne : mpw-net             |
|  |                                               |
|  |  +------------------+  HTTP  +-----------+   |
|  |  |  mpw-frontend    |<------>|mpw-backend|   |
|  |  |  nginx + React   |        | FastAPI   |   |
|  |  |  :80 (interne)   |        | :8000     |   |
|  |  +------------------+        +-----+-----+   |
|  |          |                         |          |
|  +----------|-------------------------|-----------+
|             |                         |          |
|             | expose                  | socket   |
|             v                         v          |
|          :9090                  podman.sock      |
+--------------------------------------------------+
          |
          | navigateur reseau local
          v
    http://host:9090
```

**Points cles :**
- Le backend n'est jamais expose directement - seul nginx (:9090) est accessible
- La socket est montee en lecture seule (`:ro`) : MPW ne peut pas modifier la config Podman
- En mode rootless, `root` dans le conteneur = uid de l'utilisateur hote (non-root reel)

### Flux de communication

```
Navigateur
    |
    +-- HTTP GET  /api/containers/              polling toutes les 3s
    +-- HTTP GET  /api/containers/:id/inspect   a la selection d'un conteneur
    +-- HTTP POST /api/containers/:id/start|stop|restart
    +-- WS       /api/containers/:id/logs       stream continu
    +-- WS       /api/containers/:id/stats      stream continu (~1 update/s)
    |
    v
nginx :9090
    |
    +-- ~ /api/containers/:id/(logs|stats)  --> proxy WebSocket (Upgrade: websocket)
    +-- /api/*                              --> proxy HTTP standard
    +-- /*                                  --> fichiers statiques React (SPA fallback)
    |
    v
FastAPI :8000
    |
    v
httpx AsyncClient (transport Unix socket)
    |
    v
/run/podman/podman.sock  -->  API Docker compat v1.41
```

### Format des logs Podman (multiplexe Docker)

L'API Docker compat retourne les logs dans un format multiplexe binaire. Chaque frame est precedee d'un header de 8 octets.

```
+--------+-----------+------------------+------------------+
| type   | padding   | taille payload   | payload          |
| 1 byte | 3 bytes   | 4 bytes (BE)     | N bytes          |
+--------+-----------+------------------+------------------+
  1 = stdout
  2 = stderr
```

Le backend parse ce flux dans `services/podman.py::parse_multiplexed_stream()` et envoie au frontend des objets JSON `{"stream": "stdout"|"stderr", "text": "..."}`.

### Protocoles par fonctionnalite

```
+-----------------------------+------------+------------------------------------------+
| Fonctionnalite              | Protocole  | Justification                            |
+-----------------------------+------------+------------------------------------------+
| Liste des conteneurs        | REST GET   | Polling 3s, simple et fiable             |
| Start / Stop / Restart      | REST POST  | Action ponctuelle, idempotente           |
| Inspect (reseaux, mounts)   | REST GET   | Charge uniquement a la selection         |
| Logs en direct              | WebSocket  | Stream bidirectionnel, annulable         |
| Stats CPU / RAM / reseau    | WebSocket  | Flux continu (~1 update/s)               |
+-----------------------------+------------+------------------------------------------+
```

---

## Stack technique

### Backend

| Composant | Version | Role |
|-----------|---------|------|
| Python | 3.12 | Langage principal |
| FastAPI | 0.111 | Framework async, WebSocket natif, Pydantic |
| uvicorn | 0.29 | Serveur ASGI |
| httpx | 0.27 | Client HTTP async avec support Unix socket |

### Frontend

| Composant | Version | Role |
|-----------|---------|------|
| React | 18.3 | UI composants, StrictMode |
| TypeScript | 5.5 (strict) | Typage fort, zero `any` |
| Vite | 5.3 | Build et proxy de developpement |
| Tailwind CSS | 3.4 | Styles utilitaires sans CSS runtime |

### Infrastructure

| Composant | Version | Role |
|-----------|---------|------|
| Podman | >= 4.0 | Runtime conteneurs rootless |
| podman-compose | latest | Orchestration multi-services |
| nginx | 1.27-alpine | Reverse proxy + assets statiques |
| Node | 20-slim | Build React (stage 1 du Containerfile) |
| Python | 3.12-slim | Image backend |

---

## Structure du projet

```
tool_MPW/
|
+-- backend/
|   +-- app/
|   |   +-- main.py               # FastAPI : lifespan, CORS, montage des routeurs
|   |   +-- models/
|   |   |   +-- schemas.py        # Pydantic : Container, Stats, LogEntry, ContainerDetail...
|   |   +-- services/
|   |   |   +-- podman.py         # Client socket Unix, parse_multiplexed_stream, parse_stats
|   |   +-- routers/
|   |       +-- containers.py     # REST : liste, inspect, start, stop, restart
|   |       +-- logs.py           # WebSocket : stream logs multiplexe
|   |       +-- stats.py          # WebSocket : stream metriques JSON
|   +-- requirements.txt
|   +-- Containerfile
|
+-- frontend/
|   +-- src/
|   |   +-- types/index.ts           # Interfaces TS (miroir schemas Pydantic)
|   |   +-- hooks/
|   |   |   +-- useContainers.ts     # Polling 3s + actions
|   |   |   +-- useLogs.ts           # WebSocket logs, buffer 2000 lignes
|   |   |   +-- useStats.ts          # WebSocket stats
|   |   |   +-- useContainerDetail.ts# Fetch inspect a la demande
|   |   +-- components/
|   |       +-- Header.tsx           # Barre superieure + indicateur connexion
|   |       +-- ContainerTable.tsx   # Tableau + boutons start/stop/restart
|   |       +-- StatusBadge.tsx      # Badge etat colore
|   |       +-- LogsPanel.tsx        # Terminal logs avec auto-scroll
|   |       +-- StatsPanel.tsx       # Barres CPU/RAM + compteurs reseau
|   |       +-- InfoPanel.tsx        # Reseaux, montages, taille image
|   +-- nginx/default.conf           # Proxy REST + WebSocket upgrade + headers securite
|   +-- Containerfile                # Multi-stage : Node 20 build -> nginx 1.27-alpine
|
+-- podman-compose.yml    # 2 services, reseau mpw-net, healthcheck backend
+-- deploy.sh             # Rebuild complet : stop -> rmi -> build -> up
+-- run_MPW.sh            # Lanceur : git pull -> deploy (a copier dans ~)
+-- .env.example          # Template variables d'environnement
+-- .gitignore
```

---

## Installation pas-a-pas

### Etape 0 - Installer podman-compose

> **Attention Debian/Ubuntu >= 12 :** `pip3 install` est bloque par le systeme
> (`externally-managed-environment`). Utiliser `pipx` a la place.

```bash
# Installer pipx si absent
sudo apt install pipx -y

# Installer podman-compose via pipx
pipx install podman-compose
pipx ensurepath
source ~/.bashrc

# Verifier
which podman-compose
```

### Etape 1 - Activer la socket Podman rootless

```bash
systemctl --user enable --now podman.socket

# Verifier que la socket existe
echo $XDG_RUNTIME_DIR/podman/podman.sock
# Resultat attendu : /run/user/1000/podman/podman.sock
```

> Si `$XDG_RUNTIME_DIR` est vide : `ls /run/user/$(id -u)/podman/podman.sock`

### Etape 2 - Cloner le depot

```bash
git clone https://github.com/e-lab-aure/tool_MPW.git /opt/tool_MPW
cd /opt/tool_MPW
```

### Etape 3 - Configurer l'environnement

```bash
cp .env.example .env
nano .env
```

Contenu attendu (adapter si votre UID n'est pas 1000) :

```bash
PODMAN_SOCKET_PATH_HOST=/run/user/1000/podman/podman.sock
```

```bash
# Verifier votre UID
id -u

# Verifier le chemin exact de la socket
echo $XDG_RUNTIME_DIR/podman/podman.sock
```

### Etape 4 - Copier le lanceur dans le home

```bash
cp /opt/tool_MPW/run_MPW.sh ~/run_MPW.sh
chmod +x ~/run_MPW.sh
```

### Etape 5 - Lancer le deploiement

```bash
~/run_MPW.sh
```

L'interface est accessible sur **http://\<ip-serveur\>:9090**

---

## Mise a jour

```bash
~/run_MPW.sh
```

Le script effectue automatiquement :
1. `git restore .` - reinitialise les eventuelles modifications locales
2. `git pull --rebase` - recupere la derniere version
3. Suppression des anciennes images
4. Rebuild complet des conteneurs
5. Verification du healthcheck backend avant de valider

---

## Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `PODMAN_SOCKET_PATH_HOST` | Chemin de la socket Podman sur l'hote | `/run/user/1000/podman/podman.sock` |

---

## Diagnostic et logs

```bash
# Etat des services
podman-compose ps

# Logs en direct
podman logs -f mpw-backend
podman logs -f mpw-frontend

# Healthcheck backend
podman inspect mpw-backend --format '{{.State.Health.Status}}'

# Logs persistes (backend)
podman volume inspect mpw_mpw-logs
# Les logs sont dans /var/log/mpw/backend.log a l'interieur du volume
```

---

## Problemes connus et solutions

### 1. `podman-compose: command not found`

**Symptome**

```
./deploy.sh: line 41: podman-compose: command not found
```

**Cause** : `podman-compose` n'est pas installe ou pas dans le `PATH`.

**Solution**

```bash
sudo apt install pipx -y
pipx install podman-compose
pipx ensurepath
source ~/.bashrc
```

> Ne pas utiliser `pip3 install` sur Debian/Ubuntu >= 12 - l'environnement Python est gere
> par le systeme et bloque les installations globales (`externally-managed-environment`).

---

### 2. Noms d'images courts non resolus

**Symptome**

```
Error: creating build container: short-name "nginx:1.27-alpine" did not resolve
to an alias and no unqualified-search registries are defined
```

**Cause** : Podman n'a pas de registre de recherche par defaut configure dans
`/etc/containers/registries.conf`. Contrairement a Docker qui cherche automatiquement
sur `docker.io`, Podman exige des noms complets.

**Solution** : Les `Containerfile` utilisent des noms complets qualifies.

```dockerfile
# Incorrect
FROM python:3.12-slim

# Correct
FROM docker.io/library/python:3.12-slim
```

---

### 3. Permission denied sur la socket Podman

**Symptome**

```
[CRITICAL] mpw.startup - impossible de joindre la socket Podman : [Errno 13] Permission denied
httpx.ConnectError: [Errno 13] Permission denied
```

**Cause** : En mode rootless Podman, la socket appartient a l'utilisateur hote (uid 1000).
Si le conteneur tourne avec un utilisateur non-root interne (ex: uid 1001), le mappage
des namespaces fait que cet uid ne correspond a aucun utilisateur ayant acces a la socket.

**Explication du mappage UID en rootless Podman**

```
Hote                    Conteneur
uid 1000 (user)   <-->  uid 0 (root)
uid 100001        <-->  uid 1
uid 101000        <-->  uid 1000
uid 101001        <-->  uid 1001  <-- n'a PAS acces a la socket
```

Le backend tourne donc en `root` a l'interieur du conteneur, ce qui correspond a
l'uid 1000 (non-root) sur l'hote. Il n'y a aucun privilege root reel - l'isolation
est garantie par le user namespace de Podman.

**Solution** : Ne pas definir d'utilisateur non-root dans le `Containerfile` backend.

```dockerfile
# A ne PAS faire en contexte rootless Podman avec acces socket
USER mpw  # uid 1001 dans le conteneur = uid 101001 sur l'hote, sans acces socket

# Solution : laisser le conteneur tourner en root interne
# root dans le conteneur = uid 1000 sur l'hote (non-root reel)
```

---

### 4. Backend bloque au healthcheck apres le build

**Symptome** : Le script `deploy.sh` semble fige apres le build sans message d'erreur.

**Diagnostic**

```bash
podman logs mpw-backend
podman inspect mpw-backend --format '{{.State.Health.Status}}'
```

**Causes possibles** :
- Socket inaccessible (voir probleme 3)
- Fichier `.env` manquant ou `PODMAN_SOCKET_PATH_HOST` incorrect
- Socket Podman non demarree (`systemctl --user status podman.socket`)

---

## Securite

| Mesure | Detail |
|--------|--------|
| Rootless | Podman et MPW tournent sans privileges root reels |
| Socket en lecture seule | Montee avec `:ro` - MPW ne peut pas modifier la config Podman |
| Backend non expose | Seul nginx est accessible depuis l'exterieur (:9090) |
| En-tetes HTTP | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` |
| TypeScript strict | Zero `any`, typage complet des donnees entrantes |
| CORS restreint | Methodes GET/POST uniquement, pas de credentials cross-origin |

---

## Roadmap

- [ ] Authentification JWT pour exposition hors reseau local
- [ ] Support multi-hote Podman
- [ ] Historisation des metriques avec graphes temporels
- [ ] Gestion des volumes et reseaux Podman
- [ ] Notifications sur changement d'etat critique
