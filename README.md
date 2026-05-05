# 🐍 Hydr'Hacked 

![Hydr'Hacked Logo](public/images/icone-192.png)

> "Un immense merci à l'équipe technique d'Hydracker pour sa générosité. On a trouvé votre API tellement 'ouverte d'esprit' qu'on s'est permis de l'aider à partager ses liens sans les contraintes futiles d'un navigateur ou d'un abonnement. C'est presque trop facile, mais comme on dit : c'est l'intention qui compte." 💅

---

## 🚀 Présentation
**Hydr'Hacked** est une solution complète (Serveur API + Interface Web) pour crawler, rechercher et télécharger du contenu depuis Hydracker sans les limitations habituelles. 

Fini Puppeteer, Chromium et les bypass de Cloudflare complexes. Ici, on parle directement à la source, proprement et efficacement.

> [!IMPORTANT]
> Pour profiter pleinement de l'outil, un abonnement de 5€ (pack Go) sur Hydracker est actuellement nécessaire pour obtenir une clé API fonctionnelle. 
> **Note :** Restez à l'affût, nous sortirons prochainement notre propre base de données contenant l'intégralité de leurs liens, pour une autonomie totale !

## ✨ Fonctionnalités
- **Hydr'Hacked API** : Serveur Node.js ultra-léger communiquant directement avec les endpoints privés de l'API Hydracker.
- **Frontend Premium** : Interface web moderne et responsive (Dark Mode, animations fluides).
- **Intégration JDownloader** : Envoi automatique des liens vers votre instance JDownloader (si activé dans les paramètres).
- **Pop-up Direct** : Pour ceux qui préfèrent le copier-coller à l'ancienne, le lien final s'affiche en un clic.
- **Zéro Headless** : Aucune consommation RAM inutile, tout passe par des requêtes HTTP authentifiées.

## 🤝 Un Projet Communautaire
**Hydr'Hacked** est un projet fait par la communauté, pour la communauté. Parce que le savoir (et les liens de téléchargement) ne devrait jamais être prisonnier derrière des murs de paye ou des scripts de sécurité mal conçus. 
Chaque Pull Request est la bienvenue, tant qu'elle contribue à rendre l'accès encore plus fluide et... disons, "généreux".

---

## 🛠️ Installation

### 1. Prérequis
- Node.js (v20+) ou Docker.

### 2. Configuration
Renommez `.env.example` en `.env` :
- `DW_API_KEY` : Votre sésame Hydracker.
- `API_PASSWORD` : Le mot de passe pour verrouiller l'interface.

### 3. Lancement
```bash
# Local
npm install && npm start

# Docker
docker build -t hydrhacked .
docker run -p 80:80 --env-file .env hydrhacked
```

## 📜 Licence
Projet sous licence MIT. Faites-en bon usage (ou pas, on ne juge pas).
