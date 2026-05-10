# Couleurs pour l'affichage
BLUE = \033[0;34m
GREEN = \033[0;32m
YELLOW = \033[0;33m
NC = \033[0m 

.PHONY: all install build start launch dev clean help

# Default target: show help
all: help

help: ## Affiche ce message d'aide
	@echo "$(BLUE)Commande disponibles :$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

install: node_modules ## Installation des dépendances

node_modules: package.json package-lock.json
	@echo "$(YELLOW)Vérification/Installation des dépendances...$(NC)"
	npm install
	@touch node_modules

build: node_modules ## Compilation TypeScript vers JavaScript
	@echo "$(YELLOW)Compilation du projet...$(NC)"
	npm run build
	@echo "$(GREEN)Compilation terminée!$(NC)"

start: build ## Compilation et lancement du projet
	@echo "$(YELLOW)Lancement du projet...$(NC)"
	npm start

dev: node_modules ## Lancement en mode développement (hot reload)
	@echo "$(YELLOW)Lancement du serveur en mode développement...$(NC)"
	npm run dev

clean: ## Suppression des fichiers de build et temporaires
	@echo "$(YELLOW)Nettoyage...$(NC)"
	@rm -rf dist
	@rm -rf sessions/*.json 2>/dev/null || true
	@echo "$(GREEN)Nettoyage terminé!$(NC)"
