document.addEventListener('DOMContentLoaded', () => {

    // --- INIT ICONS ---
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // --- UTILS ---
    const dom = (id) => document.getElementById(id);
    const show = (el) => el && el.classList.remove('hidden');
    const hide = (el) => el && el.classList.add('hidden');

    const showToast = (msg) => {
        const t = dom('toast');
        if (!t) return;
        t.textContent = msg;
        show(t);
        setTimeout(() => hide(t), 3000);
    };

    const updateSiteStatusUI = (isOffline, message) => {
        let banner = dom('offline-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.style = "background: #e50914; color: white; text-align: center; padding: 10px; font-weight: 700; position: sticky; top: 0; z-index: 9999; display: none; font-size: 0.9rem;";
            document.body.prepend(banner);
        }
        if (isOffline) {
            banner.textContent = `⚠️ SITE SOURCE INDISPONIBLE : ${message || 'Vérification en cours...'}`;
            banner.style.display = 'block';
        } else {
            banner.style.display = 'none';
        }
    };

    const apiCall = async (endpoint, method = 'GET', body = null) => {
        try {
            const opts = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            if (body) opts.body = JSON.stringify(body);

            const res = await fetch(endpoint, opts);
            const text = await res.text();

            if (!res.ok) {
                let err = `Erreur ${res.status}`;
                try { err = JSON.parse(text).error || err; } catch (e) { }
                throw new Error(err);
            }
            return text ? JSON.parse(text) : {};
        } catch (e) {
            console.error(`API ${endpoint}:`, e);
            throw e;
        }
    };

    // --- STATE & LOOPS MANAGER ---
    const state = {
        downloadInterval: null,
        trendingData: { films: [], series: [] },
    };

    // --- GESTION INTELLIGENTE DES BOUCLES ---

    // 1. Gestion Téléchargements (Actif seulement sur l'onglet)
    const startDownloadLoop = () => {
        if (state.downloadInterval) clearInterval(state.downloadInterval);
        loadDownloads(); // Appel immédiat
        state.downloadInterval = setInterval(loadDownloads, 5000); // Mise à jour toutes les 5s
        console.log("Flux Téléchargement : ACTIVÉ");
    };

    const stopDownloadLoop = () => {
        if (state.downloadInterval) {
            clearInterval(state.downloadInterval);
            state.downloadInterval = null;
            console.log("Flux Téléchargement : ARRÊTÉ");
        }
    };



    // --- NAVIGATION ---
    const navLinks = document.querySelectorAll('.nav-links li[data-target]');
    const sections = document.querySelectorAll('.section');

    navLinks.forEach(link => {
        link.addEventListener('click', async () => {
            const targetId = link.dataset.target;

            // 1. Gestion UI classique
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            sections.forEach(s => hide(s));
            show(dom(targetId));

            // 2. Gestion des boucles
            stopDownloadLoop();
            if (targetId === 'section-downloads') {
                startDownloadLoop();
            }
        });
    });

    // --- LOGIN ---
    const loginForm = dom('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = loginForm.querySelector('button');
            const pass = dom('api-password').value;
            const err = dom('login-error');

            btn.disabled = true;
            hide(err);

            try {
                const res = await apiCall('/login', 'POST', { password: pass });
                if (res.success) {
                    initApp();
                } else {
                    show(err);
                }
            } catch (e) {
                err.textContent = "Erreur serveur";
                show(err);
            } finally {
                btn.disabled = false;
            }
        });
    }

    const checkSession = async () => {
        try {
            const res = await apiCall('/check-session');
            if (res.isLoggedIn) initApp();
        } catch (e) { }
    };

    const initApp = async () => {
        hide(dom('login-overlay'));
        show(dom('app-container'));
        
        const toggleJd = document.getElementById('toggle-jd');
        if (toggleJd) {
            const savedState = localStorage.getItem('useJD');
            if (savedState !== null) toggleJd.checked = savedState === 'true';
            toggleJd.addEventListener('change', (e) => localStorage.setItem('useJD', e.target.checked));
        }

        loadTrending();
        lucide.createIcons();
        document.querySelectorAll('input[name="trending-type"]').forEach(radio => {
            radio.addEventListener('change', renderTrending);
        });




        // --- HEARTBEAT : Détection Hydracker Down + Refresh Tendances ---
        let wasOffline = false;
        const checkSourceStatus = async () => {
            try {
                const s = await apiCall('/status');
                updateSiteStatusUI(s.isOffline, s.message);
                
                // Désactiver/réactiver les éléments interactifs
                const searchInput = dom('search-input');
                const searchBtn = dom('btn-search-trigger');
                if (searchInput) searchInput.disabled = s.isOffline;
                if (searchBtn) searchBtn.disabled = s.isOffline;

                // Si le site revient en ligne OU si les tendances sont vides → on recharge
                if (!s.isOffline && (wasOffline || (!state.trendingData.films.length && !state.trendingData.series.length))) {
                    console.log('[Heartbeat] Site source en ligne, rechargement des tendances...');
                    loadTrending();
                }
                wasOffline = s.isOffline;
            } catch (e) {
                wasOffline = true;
                updateSiteStatusUI(true, 'Connexion au serveur perdue...');
            }
        };

        // Check toutes les 30 secondes
        setInterval(checkSourceStatus, 30000);
    };




    // --- DOWNLOADS (LIST) ---
    const loadDownloads = async () => {
        const list = dom('downloads-list');
        if (!list) return;

        try {
            const data = await apiCall('/download-status');
            list.innerHTML = '';

            if (!data || !data.length) {
                list.innerHTML = `
                    <div class="empty-state-modern">
                        <i data-lucide="hard-drive-download"></i>
                        <p>Aucun téléchargement actif</p>
                    </div>`;
                lucide.createIcons();
                return;
            }

            data.forEach(dl => {
                const item = document.createElement('div');
                item.className = 'dl-card';
                const isDone = dl.percent >= 100;
                const barColor = isDone ? 'var(--success)' : 'var(--accent)';

                item.innerHTML = `
                    <div class="dl-icon">
                        <i data-lucide="${isDone ? 'check-circle' : 'loader-2'}" class="${!isDone ? 'spin-slow' : ''}"></i>
                    </div>
                    <div class="dl-content">
                        <div class="dl-header">
                            <span class="dl-title">${dl.name}</span>
                            <span class="dl-percentage">${Math.round(dl.percent)}%</span>
                        </div>
                        <div class="dl-bar-bg">
                            <div class="dl-bar-fill" style="width: ${dl.percent}%; background: ${barColor};"></div>
                        </div>
                        <div class="dl-status-text">${isDone ? 'Terminé' : 'Téléchargement en cours...'}</div>
                    </div>
                    <button class="btn-jd-delete" title="Supprimer de JDownloader" style="background: none; border: none; color: var(--text-sec); cursor: pointer; padding: 8px; margin-left: 8px; border-radius: 8px; transition: all 0.2s;">
                        <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                    </button>
                `;

                // Attach delete handler
                const deleteBtn = item.querySelector('.btn-jd-delete');
                deleteBtn.onmouseover = () => { deleteBtn.style.color = '#ef4444'; deleteBtn.style.background = 'rgba(239,68,68,0.1)'; };
                deleteBtn.onmouseout = () => { deleteBtn.style.color = 'var(--text-sec)'; deleteBtn.style.background = 'none'; };
                deleteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Supprimer "${dl.name}" de JDownloader ?`)) return;
                    try {
                        await apiCall('/jd/remove-link', 'POST', { linkIds: [dl.uuid] });
                        showToast(`🗑️ ${dl.name} supprimé`);
                        loadDownloads();
                    } catch (err) {
                        showToast('Erreur : ' + err.message);
                    }
                };

                list.appendChild(item);
            });
            lucide.createIcons();
        } catch (e) { }
    };

    dom('btn-refresh-downloads').onclick = loadDownloads;


    // --- UTILS: BLOCKING LOADER & STATE HELPERS ---
    const cleanTitle = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");


    const toggleBlockingLoader = (show, msg = "Traitement en cours...") => {
        let loader = document.getElementById('blocking-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'blocking-loader';
            loader.className = 'hidden';
            loader.innerHTML = `<div class="loader"></div><p id="blocking-msg"></p>`;
            document.body.appendChild(loader);
        }
        if (show) {
            document.getElementById('blocking-msg').textContent = msg;
            loader.classList.remove('hidden');
        } else {
            loader.classList.add('hidden');
        }
    };

    // --- PROXY IMAGE HELPER ---
    // Passe les URLs HTTPS des posters par le proxy serveur pour éviter le blocage mixed-content
    const proxyImageUrl = (url) => {
        if (!url) return '';
        // Si l'image est déjà locale ou en HTTP sur notre domaine, pas besoin de proxy
        if (url.startsWith('/') || url.startsWith('data:')) return url;
        // Proxy les URLs HTTPS via le serveur
        if (url.startsWith('https://')) {
            return `/proxy-image?url=${encodeURIComponent(url)}`;
        }
        return url;
    };

    // --- TRENDING & CARDS ---
    const createCard = (movie) => {
        const div = document.createElement('div');
        div.className = 'card';

        const badge = '';
        const posterSrc = proxyImageUrl(movie.image);

        div.innerHTML = `
            <div class="poster-container">
                <img src="${posterSrc}" loading="lazy" alt="${movie.title}" onerror="this.style.display='none'">
                ${badge}
            </div>
            <div class="card-info">
                <div class="card-title">${movie.title}</div>
                <div class="card-year">${movie.year || ''}</div>
            </div>
        `;
        div.addEventListener('click', () => handleSelection(movie));
        return div;
    };

    const renderTrending = () => {
        const grid = dom('trending-grid');
        if (!grid) return;

        const type = document.querySelector('input[name="trending-type"]:checked').value;
        const itemsToDisplay = type === 'film' ? state.trendingData.films : state.trendingData.series;

        grid.innerHTML = '';

        if (!itemsToDisplay || !itemsToDisplay.length) {
            grid.innerHTML = '<p style="padding:1rem">Aucune tendance trouvée.</p>';
            return;
        }

        itemsToDisplay.forEach(m => grid.appendChild(createCard(m)));
    };

    const loadTrending = async () => {
        const grid = dom('trending-grid');
        if (!grid) return;

        try {
            const data = await apiCall('/trending');

            // Mise à jour de la bannière si le site est down
            updateSiteStatusUI(data.isSiteOffline, data.siteOfflineMessage);

            state.trendingData = data;

            // Si le serveur n'a pas encore fini de scrapper au démarrage
            if (data.films.length === 0 && data.series.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-sec);">
                        <div class="loader"></div>
                        <p>Le serveur prépare les tendances, un instant...</p>
                    </div>`;
                setTimeout(loadTrending, 3000); // On réessaye dans 3 secondes
                return;
            }

            renderTrending();
        } catch (e) {
            console.error("Erreur tendances:", e);
            grid.innerHTML = '<p style="padding:1rem; color: #e50914;">⚠️ Erreur de liaison avec le serveur.</p>';
        }
    };

    document.querySelectorAll('input[name="trending-type"]').forEach(radio => {
        radio.addEventListener('change', renderTrending);
    });

    // --- SEARCH ---
    const searchInput = dom('search-input');
    const searchBtn = dom('btn-search-trigger');
    const searchRadios = document.querySelectorAll('input[name="search-type"]');
    let searchTimeout = null;

    const performSearch = async () => {
        const q = searchInput ? searchInput.value.trim() : '';
        const grid = dom('search-results');
        if (!q) {
            if (grid) grid.innerHTML = '';
            return;
        }
        
        const typeEl = document.querySelector('input[name="search-type"]:checked');
        const type = typeEl ? typeEl.value : 'film';
        
        if (grid) grid.innerHTML = '<div class="loader-wrapper"><div class="loader"></div></div>';
        
        try {
            const res = await apiCall('/search', 'POST', { title: q, mediaType: type });
            // Vérification si la recherche n'a pas changé entre temps
            if (searchInput.value.trim() !== q) return;
            
            if (grid) {
                grid.innerHTML = '';
                if (!res || !res.length) grid.innerHTML = '<p style="padding:1rem; opacity:0.7;">Aucun résultat.</p>';
                else res.forEach(m => grid.appendChild(createCard(m)));
            }
        } catch (e) {
            if (grid) grid.innerHTML = `<p style="padding:1rem; color:#ef4444;">Erreur: ${e.message}</p>`;
        }
    };

    if (searchInput) {
        // Recherche instantanée avec debounce
        searchInput.addEventListener('input', () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch();
            }, 500); // 500ms d'attente
        });

        // Entrée pour valider immédiatement
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchTimeout) clearTimeout(searchTimeout);
                performSearch();
            }
        });
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (searchTimeout) clearTimeout(searchTimeout);
            performSearch();
        });
    }

    // Relancer la recherche si on change de filtre (Film/Série)
    searchRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (searchInput && searchInput.value.trim().length > 0) {
                if (searchTimeout) clearTimeout(searchTimeout);
                performSearch();
            }
        });
    });

    // --- MODAL ---
    const handleSelection = async (movie) => {
        showModal(movie.title, '<div class="loader-wrapper"><div class="loader"></div></div>');
        try {
            let ep = '/select-movie';
            if (movie.hrefPath && movie.hrefPath.includes('download')) ep = '/select-trending';
            const data = await apiCall(ep, 'POST', { hrefPath: movie.hrefPath || '', title: movie.title, type: movie.type });
            renderModalOptions(data, movie.title);
        } catch (e) {
            dom('modal-body').innerHTML = `<p style="color:red">${e.message}</p>`;
        }
    };

    function parseSizeToMB(sizeStr) {
        if (!sizeStr || sizeStr === 'N/A') return 0;
        const match = sizeStr.match(/([\d.,]+)\s*(gb|mb|ko|kb|tb)/i);
        if (!match) return 0;
        let size = parseFloat(match[1].replace(',', '.'));
        const unit = match[2].toLowerCase();
        if (unit.includes('gb') || unit.includes('go')) size *= 1024;
        else if (unit.includes('tb')) size *= 1024 * 1024;
        else if (unit.includes('kb') || unit.includes('ko')) size /= 1024;
        return size;
    }

    const getQualityRank = (qualityString) => {
        const lower = qualityString.toLowerCase();
        if (lower.includes("ultra hdlight") && lower.includes("x265")) return 1;
        if (lower.includes("1080p") && lower.includes("x265") || lower.includes("1080p light") || lower.includes("x265")) return 2;
        return 3;
    };

    const renderModalOptions = (data, currentTitle = '') => {
        const body = dom('modal-body');
        body.innerHTML = '';

        // --- 1. AFFICHAGE DES SAISONS ---
        if (data.seasons && data.seasons.length > 0) {
            const h4 = document.createElement('h4');
            h4.textContent = "Changer de Saison";
            h4.style.marginBottom = "10px";
            body.appendChild(h4);

            const seasonsContainer = document.createElement('div');
            seasonsContainer.style.display = "flex";
            seasonsContainer.style.gap = "10px";
            seasonsContainer.style.overflowX = "auto";
            seasonsContainer.style.paddingBottom = "10px";
            seasonsContainer.style.marginBottom = "20px";

            data.seasons.forEach(s => {
                // 1. Découpage de sécurité au cas où le site source fusionne le texte
                let labelsToProcess = [];
                if ((s.label.match(/Saison/ig) || []).length > 1) {
                    labelsToProcess = s.label.split(/(?=Saison\s*\d+)/i).filter(Boolean);
                } else {
                    labelsToProcess = [s.label];
                }

                labelsToProcess.forEach((cleanLabel, subIndex) => {
                    const btn = document.createElement('button');
                    btn.className = 'season-btn';
                    btn.style.padding = "8px 16px";
                    btn.style.background = "var(--bg-card)";
                    btn.style.border = "1px solid var(--border)";
                    btn.style.borderRadius = "20px";
                    btn.style.color = "white";
                    btn.style.cursor = "pointer";
                    btn.style.whiteSpace = "nowrap";
                    btn.style.flexShrink = "0";
                    btn.style.fontWeight = "600";
                    btn.style.transition = "all 0.2s ease";

                    // Effets de survol (Hover)
                    btn.onmouseover = () => {
                        btn.style.background = "var(--primary)";
                        btn.style.borderColor = "var(--primary)";
                    };
                    btn.onmouseout = () => {
                        btn.style.background = "var(--bg-card)";
                        btn.style.borderColor = "var(--border)";
                    };


                    btn.innerHTML = `<span>${cleanLabel.trim()}</span>`;

                    btn.onclick = async () => {
                        body.innerHTML = '<div class="loader-wrapper"><div class="loader"></div></div>';
                        try {
                            const res = await apiCall('/select-season', 'POST', { seasonValue: s.value });
                            res.seasons = data.seasons;
                            renderModalOptions(res, currentTitle);
                        } catch (e) {
                            body.innerHTML = `<p style="color:red; padding:1rem;">Erreur: ${e.message}</p>`;
                        }
                    };
                    seasonsContainer.appendChild(btn);
                });
            });
            body.appendChild(seasonsContainer);
        }

        // --- 2. AFFICHAGE DES FICHIERS ---
        if (data.clientOptions && data.clientOptions.length) {
            const h4 = document.createElement('h4');
            h4.textContent = "Fichiers Disponibles"; h4.className = "modal-subtitle";
            body.appendChild(h4);


            const MAX_FILM_SIZE_MB = 15360; // Limite fixée à 15 Go

            const sortedOptions = data.clientOptions.map(q => {
                const isFullSeason = q.episode && q.episode.toLowerCase().includes('saison complète') ? 1 : 0;
                return {
                    ...q,
                    sizeVal: parseSizeToMB(q.size),
                    rank: getQualityRank(q.quality),
                    isFullSeason: isFullSeason
                };
            })
                .filter(q => {
                    if (!q.episode) {
                        return q.sizeVal <= MAX_FILM_SIZE_MB;
                    }
                    return true;
                })
                .sort((a, b) => {
                    if (a.isFullSeason !== b.isFullSeason) return b.isFullSeason - a.isFullSeason;
                    if (a.rank !== b.rank) return a.rank - b.rank;
                    return a.sizeVal - b.sizeVal;
                });

            // Sécurité : Si tous les fichiers sont filtrés, on prévient l'utilisateur
            if (data.clientOptions.length > 0 && sortedOptions.length === 0) {
                const info = document.createElement('p');
                info.style.color = "var(--text-sec)";
                info.style.textAlign = "center";
                info.style.padding = "1rem";
                info.textContent = "🚫 Aucun fichier trouvé sous la limite de taille (1 Go pour les films).";
                body.appendChild(info);
                return;
            }

            sortedOptions.forEach(q => {
                const btn = document.createElement('button');

                let specialClass = '';
                let icon = '';
                let titleText = q.episode ? (q.isFullSeason ? q.episode : 'Ep. ' + q.episode) : 'Film';

                if (q.isFullSeason) {
                    specialClass = 'quality-gold';
                    icon = '📦';
                } else if (q.rank === 1) {
                    specialClass = 'quality-gold'; icon = '⭐';
                } else if (q.rank === 2) {
                    specialClass = 'quality-blue'; icon = '✨';
                }

                btn.className = `option-btn ${specialClass}`;

                btn.innerHTML = `
                    <div class="opt-left">
                        <div class="opt-title">
                            ${icon} ${titleText}
                            <span class="quality-tag">${q.quality}</span>
                        </div>
                        <div class="opt-meta">${q.size || 'Taille inconnue'}</div>
                    </div>
                    <i data-lucide="download" class="opt-icon"></i>
                `;

                btn.onclick = async () => {
                    hide(dom('modal-overlay'));
                    toggleBlockingLoader(true, "Récupération du lien...");
                    try {
                        const useJD = document.getElementById('toggle-jd') ? document.getElementById('toggle-jd').checked : true;
                        const result = await apiCall('/get-link', 'POST', { chosenId: q.id, useJD });
                        toggleBlockingLoader(false);
                        
                        if (useJD) {
                            showToast('Lien envoyé à JDownloader !');
                            document.querySelector('.nav-links li[data-target="section-downloads"]').click();
                        } else {
                            showModal('Lien Direct Récupéré', `
                                <div style="text-align:center; padding: 20px;">
                                    <p style="margin-bottom: 15px; color: var(--text-sec);">Voici votre lien 1fichier :</p>
                                    <input type="text" value="${result.link}" readonly style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: #fff; margin-bottom: 15px;" id="direct-link-input">
                                    <div style="display:flex; gap: 10px; justify-content: center;">
                                        <button class="btn-primary" onclick="document.getElementById('direct-link-input').select(); document.execCommand('copy');">Copier</button>
                                        <a href="${result.link}" target="_blank" class="btn-success" style="text-decoration:none; line-height: 20px; padding: 10px 20px; border-radius: 8px;">Ouvrir</a>
                                    </div>
                                </div>
                            `);
                        }
                    } catch (e) {
                        toggleBlockingLoader(false);
                        showToast("Erreur: " + e.message);
                        show(dom('modal-overlay'));
                    }
                };
                body.appendChild(btn);
            });
        }
        lucide.createIcons();
    };


    const showModal = (title, content) => {
        dom('modal-title').textContent = title;
        dom('modal-body').innerHTML = content;
        show(dom('modal-overlay'));
    };

    dom('modal-close').onclick = () => {
        hide(dom('modal-overlay'));
    };

    // (Logique Manuelle supprimée car inutile)



    dom('btn-logout').onclick = async () => {
        await apiCall('/logout', 'POST');
        location.reload();
    };

    // Start
    checkSession();
});