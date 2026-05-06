# 🐍 Hydr'Hacked 

![Hydr'Hacked Logo](public/images/icone-192.png)

> "Un immense merci à l'équipe technique d'Hydracker pour sa générosité. On a trouvé votre API tellement 'ouverte d'esprit' qu'on s'est permis de l'aider à partager ses liens sans les contraintes futiles d'un navigateur ou d'un abonnement. C'est presque trop facile, mais comme on dit : c'est l'intention qui compte." 💅

---

## 🚀 Présentation

**Hydr'Hacked** est une solution complète (Serveur API + Interface Web) pour crawler, rechercher et télécharger du contenu depuis Hydracker sans les limitations habituelles. 

> [!IMPORTANT]
> Pour le moment, **Hydr'Hacked** ne gère pas la récupération des séries sans abonnement Hydracker.
> Pour récupérer les séries, il faut un abonnement Hydracker (pack Go à 5€) et fournir la clé API dans les paramètres.
> **Bonne nouvelle :** La recherche, les tendances et **tous les films** fonctionnent **sans aucun token**. Vraiment.
> **Note :** Restez à l'affût, nous sortirons prochainement notre propre base de données contenant l'intégralité de leurs liens, pour une autonomie totale !

## ✨ Fonctionnalités

- 🔍 **Recherche & Tendances** : Chercher vos films et séries ou récupérer les tendances.
- 💻 **Interface web** : Interface web moderne et responsive (Dark Mode, animations fluides).
- 🔗 **Affichage des liens** : Copier-coller le lien final s'affiche en un clic. 
- ⚡ **Intégration JDownloader** : Envoi automatique des liens vers votre instance JDownloader (si activé dans les paramètres).

## 🔑 Ce qui nécessite (ou pas) un token

| Fonctionnalité | 100% gratuit |
|---|---|
| 🔍 Recherche | ✅ Gratuit |
| 🔥 Tendances | ✅ Gratuit |
| 🎬 Films (liens 1fichier) | ✅ Gratuit |
| 🖼️ Affiches (posters) | ✅ Gratuit (proxy intégré) |
| 📺 Séries (liens 1fichier) | ❌nécessite un abonnement Hydracker |


---

## 📸 Screenshots

### Interface Web

![Screenshot](images/screenshot_tendances.png)

### Qualités

![Screenshot](images/screenshot_quality.png)


---
## 🛠️ Installation

### 🐳 Via Docker (Recommandé)

C'est la méthode la plus simple pour garder un environnement propre.

```bash
# 1. Cloner le projet (si ce n'est pas déjà fait)
git clone https://github.com/NoNoBzH22/Hydr-Hacked

# 2. Préparer la configuration
cp .env.example .env

# 3. Lancer l'application
docker compose up -d --build
```
📍 Accès : `http://localhost:3067`

---

### 💻 Installation Manuelle
Pour ceux qui préfèrent une installation classique.

**Prérequis :** [Node.js](https://nodejs.org/) v20+

```bash
# 1. Installer les dépendances
npm install

# 2. Préparer la configuration
cp .env.example .env

# 3. Lancer le serveur
npm start
```

---

### ⚙️ Configuration (.env)

Créez un fichier `.env` à la racine du projet et configurez les variables suivantes :

| Variable | Type | Description |
|---|---|---|
| `API_PASSWORD` | **Requis** | Mot de passe pour l'écran de connexion initial. |
| `SECRET` | **Requis** | Clé secrète pour les sessions (mettez ce que vous voulez). |
| `DW_API_KEY` | Optionnel | Votre token Hydracker (nécessaire **uniquement** pour les séries). |
| `PORT` | Optionnel | Port de l'application (Défaut : `3067`). |
| `JD_HOST` | Optionnel | IP/Hôte de JDownloader (ex: `192.168.1.50`). |
| `JD_API_PORT` | Optionnel | Port API de JDownloader (Défaut : `3128`). |

> [!TIP]
> **Comment obtenir ma `DW_API_KEY` ?**
> Connectez-vous sur Hydracker, cherchez la page **Paramètres du compte** et descendez jusqu'à **Jetons d'accès API**. 
> Cliquez sur **Créer un jeton** et copiez le token généré dans le champ `DW_API_KEY` de votre `.env`.


## 🤝 Un Projet Communautaire
**Hydr'Hacked** est un projet fait par la communauté, pour la communauté. Parce que le savoir (et les liens de téléchargement) ne devrait jamais être prisonnier derrière des murs de paye ou des scripts de sécurité mal conçus. 
Chaque Pull Request est la bienvenue, tant qu'elle contribue à rendre l'accès encore plus fluide et... disons, "généreux".


## 📜 Licence
Projet sous licence MIT. Faites-en bon usage (ou pas, on ne juge pas).
