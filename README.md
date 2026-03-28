# Master Pod Warden (MPW)

> Take control of your Podman infrastructure.

Interface web temps reel pour gerer, surveiller et piloter vos conteneurs Podman depuis un navigateur - sans daemon, sans root, depuis un conteneur.

---

## Fonctionnalites

- **Liste des conteneurs** - vue consolidee avec etat, image, ports et date de creation
- **Actions directes** - start / stop / restart en un clic
- **Logs en direct** - stream WebSocket avec distinction stdout / stderr et auto-scroll
- **Metriques temps reel** - CPU, RAM, trafic reseau mis a jour chaque seconde
- **Design securise** - rootless, socket montee en lecture seule, aucun port backend expose

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
|          | monte en :ro                          |
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

### Flux de communication

```
Navigateur
    |
    +-- HTTP GET  /api/containers/              (polling 3s)
    +-- HTTP POST /api/containers/:id/start
    +-- HTTP POST /api/containers/:id/stop
    +-- HTTP POST /api/containers/:id/restart
    +-- WS       /api/containers/:id/logs       (stream continu)
    +-- WS       /api/containers/:id/stats      (stream continu)
    |
    v
nginx : 9090
    |
    +-- regex ~ /logs|stats  --> proxy WebSocket (Upgrade: websocket)
    +-- /api/*               --> proxy HTTP standard
    +-- /*                   --> fichiers statiques React (SPA fallback)
    |
    v
FastAPI : 8000
    |
    +-- GET  /api/containers/           --> httpx GET  /v1.41/containers/json
    +-- POST /api/containers/:id/start  --> httpx POST /v1.41/containers/:id/start
    +-- POST /api/containers/:id/stop   --> httpx POST /v1.41/containers/:id/stop
    +-- WS   /api/containers/:id/logs   --> httpx stream GET /v1.41/containers/:id/logs
    +-- WS   /api/containers/:id/stats  --> httpx stream GET /v1.41/containers/:id/stats
    |
    v
Unix socket : /run/podman/podman.sock
    |
    v
Podman rootless (API compat Docker v1.41)
```

### Protocoles par fonctionnalite

```
+---------------------------+------------+------------------------------------------+
| Fonctionnalite            | Protocole  | Justification                            |
+---------------------------+------------+------------------------------------------+
| Liste des conteneurs      | REST GET   | Polling 3s, simple et fiable             |
| Start / Stop / Restart    | REST POST  | Ponctuel, idempotent                     |
| Logs en direct            | WebSocket  | Stream bidirectionnel, annulable         |
| Stats CPU / RAM / reseau  | WebSocket  | Flux continu ~1 update/s                 |
+---------------------------+------------+------------------------------------------+
```

### Parsing des logs (format multiplexe Docker)

```
Flux brut Podman (API compat)
    |
    v
+--------+--------+------------------+
| type   | pad    | taille  | payload|
| 1 byte | 3 byte | 4 bytes | N bytes|
+--------+--------+------------------+
  1=stdout                   texte log
  2=stderr

    |
    v
FastAPI parse_multiplexed_stream()
    |
    v
WebSocket --> {"stream": "stdout"|"stderr", "text": "..."}
    |
    v
React LogsPanel
  stdout --> texte blanc
  stderr --> texte orange
```

---

## Stack technique

### Backend

| Composant | Role |
|-----------|------|
| Python 3.12 | Langage principal |
| FastAPI | Framework async, WebSocket natif, validation Pydantic |
| uvicorn | Serveur ASGI haute performance |
| httpx | Client HTTP async avec support Unix socket |

### Frontend

| Composant | Role |
|-----------|------|
| React 18 | UI composants, StrictMode |
| TypeScript strict | Typage fort, zero `any` |
| Vite | Build ultra-rapide, proxy dev integre |
| Tailwind CSS | Styles utilitaires, aucun CSS injecte au runtime |

### Infrastructure

| Composant | Role |
|-----------|------|
| Podman rootless | Runtime conteneurs, pas de daemon root |
| podman-compose | Orchestration locale multi-services |
| nginx 1.27-alpine | Reverse proxy + serving assets statiques |
| Multi-stage build | Image frontend minimale (node build -> nginx) |

---

## Structure du projet

```
tool_MPW/
|
+-- backend/
|   +-- app/
|   |   +-- main.py               # Application FastAPI, lifespan, middlewares CORS
|   |   +-- models/
|   |   |   +-- schemas.py        # Types Pydantic (Container, Stats, LogEntry...)
|   |   +-- services/
|   |   |   +-- podman.py         # Client Unix socket, parsers logs/stats
|   |   +-- routers/
|   |       +-- containers.py     # REST : liste, start, stop, restart
|   |       +-- logs.py           # WebSocket : stream logs multiplexe
|   |       +-- stats.py          # WebSocket : stream metriques
|   +-- requirements.txt
|   +-- Containerfile             # Python 3.12-slim, user non-root mpw:1001
|
+-- frontend/
|   +-- src/
|   |   +-- types/index.ts        # Interfaces TypeScript (miroir schemas backend)
|   |   +-- hooks/
|   |   |   +-- useContainers.ts  # Polling REST 3s + actions start/stop/restart
|   |   |   +-- useLogs.ts        # WebSocket logs, buffer 2000 lignes max
|   |   |   +-- useStats.ts       # WebSocket stats, mise a jour ~1/s
|   |   +-- components/
|   |   |   +-- Header.tsx        # Barre superieure + indicateur connexion Podman
|   |   |   +-- ContainerTable.tsx   # Tableau principal avec boutons d'action
|   |   |   +-- StatusBadge.tsx   # Badge etat colore (running/exited/paused...)
|   |   |   +-- LogsPanel.tsx     # Terminal logs auto-scroll, toggle stderr/stdout
|   |   |   +-- StatsPanel.tsx    # Barres CPU/RAM + compteurs reseau
|   |   +-- App.tsx               # Layout split-view, gestion onglets Logs/Stats
|   |   +-- main.tsx              # Point d'entree React (StrictMode)
|   |   +-- styles.css            # Tailwind base + scrollbar personnalisee
|   +-- nginx/default.conf        # Proxy REST + WebSocket upgrade + headers securite
|   +-- Containerfile             # Multi-stage : build Node 20 -> nginx 1.27-alpine
|   +-- package.json / tsconfig.json / vite.config.ts / tailwind.config.js
|
+-- podman-compose.yml            # 2 services, reseau mpw-net, healthcheck backend
+-- deploy.sh                     # Rebuild complet : stop -> rmi -> build -> up
+-- run_MPW.sh                    # Lanceur : git pull -> deploy (a copier dans ~)
+-- .env.example                  # Template : PODMAN_SOCKET_PATH_HOST
+-- .gitignore
+-- README.md
```

---

## Installation

### Prerequis

- Podman >= 4.0 installe sur l'hote
- `podman-compose` installe (voir ci-dessous)
- Acces SSH au serveur

### 0. Installer podman-compose

```bash
pip3 install podman-compose

# Si pip3 est absent :
sudo apt install python3-pip -y && pip3 install podman-compose

# Verifier que la commande est dans le PATH
which podman-compose
# Si vide, ajouter dans ~/.bashrc :
echo 'export PATH=$HOME/.local/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
```

### 1. Activer la socket Podman rootless

```bash
systemctl --user enable --now podman.socket

# Verifier le chemin de la socket
echo $XDG_RUNTIME_DIR/podman/podman.sock
# Resultat typique : /run/user/1000/podman/podman.sock
```

### 2. Cloner et configurer

```bash
git clone https://github.com/e-lab-aure/tool_MPW.git /opt/tool_MPW
cd /opt/tool_MPW

cp .env.example .env
nano .env
# Renseigner PODMAN_SOCKET_PATH_HOST avec le chemin de l'etape 1
# Verifier votre UID avec : id -u
```

### 3. Premier deploiement

```bash
chmod +x deploy.sh
./deploy.sh
```

L'interface est accessible sur **http://\<ip-serveur\>:9090**

---

## Mise a jour

Copier le lanceur dans le home au premier deploiement :

```bash
cp /opt/tool_MPW/run_MPW.sh ~/run_MPW.sh
chmod +x ~/run_MPW.sh
```

Ensuite, pour chaque mise a jour :

```bash
~/run_MPW.sh
```

Le script effectue : `git restore` -> `git pull --rebase` -> rebuild images -> redemarrage.

---

## Securite

| Mesure | Detail |
|--------|--------|
| Rootless | Podman et MPW tournent sans privileges root |
| Socket en lecture seule | Montee avec `:ro`, le backend ne peut pas reconfigurer Podman |
| Backend non expose | Seul nginx est accessible depuis l'exterieur (:9090) |
| En-tetes HTTP | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` |
| Utilisateur non-root | Backend tourne sous `mpw` (uid 1001) dans le conteneur |
| TypeScript strict | Zero `any`, typage complet cote frontend |
| CORS restreint | Methodes GET/POST uniquement, pas de credentials cross-origin |

---

## Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `PODMAN_SOCKET_PATH_HOST` | Chemin de la socket Podman sur l'hote | `/run/user/1000/podman/podman.sock` |

```bash
# Trouver votre UID
id -u

# Trouver le chemin exact de la socket
echo $XDG_RUNTIME_DIR/podman/podman.sock
```

---

## Logs et diagnostic

```bash
# Logs en direct
podman logs -f mpw-backend
podman logs -f mpw-frontend

# Statut des services
podman-compose ps

# Healthcheck backend
podman inspect mpw-backend --format '{{.State.Health.Status}}'
```

Les logs du backend sont egalement persistes dans le volume `mpw-logs` (`/var/log/mpw/backend.log`).

---

## Roadmap

- [ ] Authentification (JWT) pour exposition hors reseau local
- [ ] Support multi-hote Podman
- [ ] Historisation des metriques avec graphes temporels
- [ ] Gestion des volumes et reseaux Podman
- [ ] Notifications sur changement d'etat critique
