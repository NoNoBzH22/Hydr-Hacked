FROM node:22-slim

# Installer Caddy et les utilitaires nécessaires
RUN apt-get update && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y caddy \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installer les dépendances Node
COPY package*.json ./
RUN npm install

# Copier le reste du projet
COPY . .

# Exposer le port de Caddy
EXPOSE 80

# Script de démarrage combiné
RUN echo '#!/bin/sh\nnode server.js &\nexec caddy run --config Caddyfile --adapter caddyfile\n' > start.sh \
    && chmod +x start.sh

# Lancer le script
CMD ["./start.sh"]
