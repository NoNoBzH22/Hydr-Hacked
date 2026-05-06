FROM node:22-slim
WORKDIR /app
# Installation des dépendances
COPY package*.json ./
RUN npm install --production
# Copie du code source
COPY . .
# On expose le port défini dans le .env (ou 3067 par défaut)
EXPOSE 3067
# Lancement direct de Node.js
CMD ["node", "server.js"]