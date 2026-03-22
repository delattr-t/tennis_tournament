# 🎾 Tournoi de Tennis

Application web de gestion de tournois de tennis entre amis — simple ou double, poules ou tableau direct.

## Fonctionnalités

- **Inscriptions** — formulaire public pour les joueurs + saisie manuelle par l'admin
- **Mode simple & double** — gestion des équipes en double
- **Deux formats** — tableau direct ou phase de poules suivie d'un tableau final
- **Scores flexibles** — score simple ou par sets, configurable par tour
- **Vue admin protégée** — mot de passe requis pour gérer le tournoi
- **Vue joueur** — lecture seule : tableau, poules, liste des inscrits
- **Classement** — mis à jour en temps réel

## Lancement

Aucune dépendance, aucun serveur requis. Ouvrez simplement `index.html` dans un navigateur.

```bash
open index.html
# ou
python3 -m http.server 8080  # puis http://localhost:8080
```

## Mot de passe admin par défaut

```
tennis123
```

Modifiable depuis l'onglet **Configuration** une fois connecté.

## Workflow typique

1. Ouvrir `index.html`
2. Les joueurs s'inscrivent via la vue publique (onglet *Inscription*)
3. L'admin se connecte → **Configuration**
   - Choisir Simple ou Double
   - Choisir Tableau direct ou Poules + Tableau
   - Régler la saisie des scores (simple / sets / les deux)
4. Cliquer **Lancer le tournoi ▶** — les poules et/ou le tableau sont générés automatiquement
5. En mode Double : former les équipes avant de lancer
6. Saisir les scores match par match (clic sur le match)
7. En mode Poules : le tableau final se génère automatiquement quand toutes les poules sont terminées

## Structure du projet

```
tennis-tournament/
├── index.html   # Structure HTML
├── style.css    # Styles (dark mode inclus)
├── app.js       # Logique complète (state + render)
└── README.md
```

## Déploiement

Le projet est un site statique — déployable sur :

- **GitHub Pages** : activer dans Settings → Pages → branch `main`
- **Vercel** : `vercel --prod` depuis le dossier
- **Netlify** : drag & drop du dossier sur netlify.com

## Commandes Git

```bash
# Initialiser le repo
git init
git add .
git commit -m "feat: application tournoi de tennis"

# Lier à GitHub (remplacez par votre repo)
git remote add origin https://github.com/VOTRE_USERNAME/tennis-tournament.git
git branch -M main
git push -u origin main
```
