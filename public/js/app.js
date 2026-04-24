// ===== SPOTYPOBRE V2 — Main App Logic =====

(function () {
  'use strict';

  // --- External Dependencies ---
  const supabase = window.supabaseClient; // from supabase-config.js
  
  // --- DOM Elements ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    // Nav
    navHome: $('#nav-home'),
    navPlaylists: $('#nav-playlists'),
    navOffline: $('#nav-offline'),
    navLogin: $('#nav-login'),
    navUser: $('#nav-user'),
    views: $$('.view'),
    
    // Auth Modal
    modalAuth: $('#modal-auth'),
    authForm: $('#auth-form'),
    authEmail: $('#auth-email'),
    authPassword: $('#auth-password'),
    authError: $('#auth-error'),
    authTitle: $('#auth-title'),
    btnToggleAuth: $('#btn-toggle-auth'),
    btnSubmitAuth: $('#btn-submit-auth'),
    btnCloseAuth: $('#btn-close-auth'),

    // Add to Playlist Modal
    modalPlaylist: $('#modal-add-to-playlist'),
    modalPlaylistsList: $('#modal-playlists-list'),
    btnCloseModalPlaylist: $('#btn-close-modal-playlist'),

    // Playlists View
    playlistsList: $('#playlists-list'),
    playlistDetails: $('#playlist-details'),
    playlistTracksList: $('#playlist-tracks-list'),
    btnCreatePlaylist: $('#btn-create-playlist'),
    btnBackPlaylists: $('#btn-back-playlists'),
    currentPlaylistTitle: $('#current-playlist-title'),

    // Offline View
    offlineTracksList: $('#offline-tracks-list'),
    offlineEmptyState: $('#offline-empty-state'),
    offlineAudio: $('#offline-audio'),

    // Search
    searchInput: $('#search-input'),
    searchClear: $('#search-clear'),
    welcomeScreen: $('#welcome-screen'),
    loadingState: $('#loading-state'),
    resultsContainer: $('#results-container'),
    resultsList: $('#results-list'),
    resultsTitle: $('#results-title'),
    resultsCount: $('#results-count'),
    errorState: $('#error-state'),
    errorMessage: $('#error-message'),
    errorRetry: $('#error-retry'),

    // Player
    playerBar: $('#player-bar'),
    playerThumbnail: $('#player-thumbnail'),
    playerTitle: $('#player-title'),
    playerArtist: $('#player-artist'),
    playerCurrentTime: $('#player-current-time'),
    playerTotalTime: $('#player-total-time'),
    playerProgressBar: $('#player-progress-bar'),
    playerProgressThumb: $('#player-progress-thumb'),
    playerProgressContainer: $('#player-progress-container'),
    btnPlayPause: $('#btn-play-pause'),
    btnPrev: $('#btn-prev'),
    btnNext: $('#btn-next'),
    btnDownloadCurrent: $('#btn-download-current'),
    volumeSlider: $('#volume-slider'),
    iconPlay: $('#icon-play'),
    iconPause: $('#icon-pause'),
    iconLoading: $('#icon-loading'),
    toast: $('#toast'),
    toastMessage: $('#toast-message'),
    logo: $('#logo'),
  };

  // --- State ---
  const state = {
    user: null,
    isLoginMode: true,
    view: 'home', // 'home', 'playlists', 'offline'
    
    // Player State
    tracks: [], // Current queued tracks
    currentIndex: -1,
    isPlaying: false,
    isLoading: false,
    playingMode: 'youtube', // 'youtube' or 'offline'
    activeTrackId: null,

    // Search
    lastQuery: '',
    
    // Playlists
    playlists: [],
    currentPlaylistViewId: null,
    trackToAddId: null, // Queued for modal
  };

  // --- Offline DB (IndexedDB) ---
  const dbPromise = idb.openDB('spotypobre-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
    },
  });

  // --- YT Player Initialization ---
  let ytPlayer = null;
  let ytPlayerReady = false;
  let progressInterval = null;

  window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      videoId: '',
      playerVars: {
        'playsinline': 1, 'controls': 0, 'disablekb': 1,
        'fs': 0, 'iv_load_policy': 3, 'rel': 0, 'modestbranding': 1
      },
      events: {
        'onReady': () => { 
          ytPlayerReady = true; 
          ytPlayer.setVolume(els.volumeSlider.value);
        },
        'onStateChange': onPlayerStateChange,
        'onError': (e) => {
          console.error('YT Player error:', e.data);
          setPlayerState('paused');
          showToast('❌ Erro ao reproduzir o áudio (YT)');
        }
      }
    });
  };

  // --- Utilities ---
  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function showToast(message, duration = 3000) {
    els.toastMessage.textContent = message;
    els.toast.classList.remove('hidden');
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      els.toast.classList.remove('show');
      setTimeout(() => els.toast.classList.add('hidden'), 300);
    }, duration);
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Views Management ---
  function switchView(viewName) {
    state.view = viewName;
    
    // Update nav active state
    els.navHome.classList.toggle('active', viewName === 'home');
    els.navPlaylists.classList.toggle('active', viewName === 'playlists');
    els.navOffline.classList.toggle('active', viewName === 'offline');
    
    // Switch views
    els.views.forEach(v => v.classList.add('hidden'));
    $(`#view-${viewName}`).classList.remove('hidden');

    if (viewName === 'playlists') loadPlaylists();
    if (viewName === 'offline') loadOfflineTracks();
  }

  // Bind Nav
  els.navHome.addEventListener('click', () => switchView('home'));
  els.navPlaylists.addEventListener('click', () => switchView('playlists'));
  els.navOffline.addEventListener('click', () => switchView('offline'));
  els.logo.addEventListener('click', () => {
    switchView('home');
    window.scrollTo(0,0);
  });

  // Home Section Visibility
  function showHomeSection(section) {
    // Hide everything first
    const sections = [els.welcomeScreen, els.loadingState, els.resultsContainer, els.errorState];
    sections.forEach(s => s?.classList.add('hidden'));

    if (!section) return;

    // Show specific section
    if (section === 'welcome') els.welcomeScreen?.classList.remove('hidden');
    else if (section === 'loading') els.loadingState?.classList.remove('hidden');
    else if (section === 'results') els.resultsContainer?.classList.remove('hidden');
    else if (section === 'error') els.errorState?.classList.remove('hidden');
  }

  // --- Auth & Supabase ---
  async function initAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      handleAuthChange(session?.user || null);

      supabase.auth.onAuthStateChange((_event, session) => {
        handleAuthChange(session?.user || null);
      });
    } catch (e) {
      console.warn("Supabase offline ou indisponível.");
    }
  }

  function handleAuthChange(user) {
    state.user = user;
    if (user) {
      els.navLogin.classList.add('hidden');
      els.navUser.classList.remove('hidden');
      els.navPlaylists.classList.remove('hidden');
      els.navUser.textContent = 'Sair';
    } else {
      els.navLogin.classList.remove('hidden');
      els.navUser.classList.add('hidden');
      els.navPlaylists.classList.add('hidden');
      if(state.view === 'playlists') switchView('home');
    }
  }

  els.navLogin.addEventListener('click', () => els.modalAuth.classList.remove('hidden'));
  els.btnCloseAuth.addEventListener('click', () => els.modalAuth.classList.add('hidden'));
  els.navUser.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showToast('Você saiu.');
  });

  els.btnToggleAuth.addEventListener('click', () => {
    state.isLoginMode = !state.isLoginMode;
    els.authTitle.textContent = state.isLoginMode ? 'Entrar' : 'Criar Conta';
    els.btnSubmitAuth.textContent = state.isLoginMode ? 'Entrar' : 'Cadastrar';
    els.btnToggleAuth.textContent = state.isLoginMode ? 'Criar conta' : 'Fazer login';
  });

  els.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = els.authEmail.value;
    const password = els.authPassword.value;
    els.authError.classList.add('hidden');
    els.btnSubmitAuth.disabled = true;

    try {
      let result;
      if (state.isLoginMode) {
        result = await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = await supabase.auth.signUp({ email, password });
      }
      
      if (result.error) throw result.error;
      
      els.modalAuth.classList.add('hidden');
      showToast(state.isLoginMode ? 'Bem-vindo de volta!' : 'Conta criada com sucesso!');
      els.authForm.reset();
    } catch (err) {
      els.authError.textContent = err.message || 'Erro na autenticação';
      els.authError.classList.remove('hidden');
    } finally {
      els.btnSubmitAuth.disabled = false;
    }
  });

  // --- Search ---
  async function performSearch(query) {
    if (!query.trim()) { showHomeSection('welcome'); return; }
    state.lastQuery = query.trim();
    showHomeSection('loading');
    switchView('home');

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Status ${res.status}: ${errorText}`);
      }
      
      const data = await res.json();
      const searchedTracks = data.tracks || [];

      if (searchedTracks.length === 0) {
        els.errorMessage.textContent = `Nenhum resultado para "${query.trim()}"`;
        showHomeSection('error');
        return;
      }
      
      renderTrackList(searchedTracks, els.resultsList, 'search');
      els.resultsTitle.textContent = `Resultados para "${state.lastQuery}"`;
      els.resultsCount.textContent = `${searchedTracks.length} músicas`;
      showHomeSection('results');
    } catch (err) {
      console.error('Fetch /api/search error:', err);
      els.errorMessage.textContent = `Erro: ${err.message}`;
      showHomeSection('error');
    }
  }

  const debouncedSearch = debounce((q) => performSearch(q), 600);
  els.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    els.searchClear.classList.toggle('hidden', val.length === 0);
    if (val.trim().length >= 2) debouncedSearch(val);
    else if (val.trim().length === 0) showHomeSection('welcome');
  });

  els.searchClear.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchClear.classList.add('hidden');
    showHomeSection('welcome');
  });

  // --- Render Generic Track List ---
  // ListContext: 'search', 'playlist', 'offline'
  function renderTrackList(tracks, container, listContext) {
    container.innerHTML = tracks.map((track, i) => `
      <div class="track-card ${state.activeTrackId === track.id ? 'active' : ''}"
           data-index="${i}" data-id="${track.id}">
        <div class="track-card-number">
          <span class="num-text">${i + 1}</span>
          <div class="playing-bars">
            <span class="playing-bar"></span><span class="playing-bar"></span>
            <span class="playing-bar"></span><span class="playing-bar"></span>
          </div>
        </div>
        <div class="track-thumbnail-wrapper">
          <img class="track-thumbnail" src="${escapeAttr(track.thumbnail)}" loading="lazy">
          <div class="track-play-overlay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
        </div>
        <div class="track-info">
          <div class="track-title">${escapeHtml(track.title)}</div>
          <div class="track-artist">${escapeHtml(track.artist)}</div>
        </div>
        <span class="track-duration">${escapeHtml(track.duration || '')}</span>
        
        <button class="btn-add-playlist add-to-playlist-btn" aria-label="Adicionar a Playlist">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>

        ${listContext === 'offline' ? `
          <button class="track-download-btn delete-offline-btn" aria-label="Excluir Offline">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        ` : `
          <button class="track-download-btn download-offline-btn" aria-label="Baixar Offline">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M12 15l-4-4M12 15l4-4M5 20h14"/></svg>
          </button>
        `}
      </div>
    `).join('');

    // Bind playback
    container.querySelectorAll('.track-card').forEach(card => {
      card.addEventListener('click', () => {
        // Prepare global playlist state to match current list type
        state.tracks = tracks;
        state.playingMode = (listContext === 'offline') ? 'offline' : 'youtube';
        playTrack(parseInt(card.dataset.index));
      });
    });

    // Bind Add to Playlist
    container.querySelectorAll('.add-to-playlist-btn').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddToPlaylistModal(tracks[i]);
      });
    });

    // Bind Download/Delete Offline
    container.querySelectorAll('.download-offline-btn').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveTrackOffline(tracks[i], btn);
      });
    });

    container.querySelectorAll('.delete-offline-btn').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTrackOffline(tracks[i].id);
      });
    });
  }

  // --- Offline (IndexedDB) Logic ---
  async function saveTrackOffline(track, btnElement) {
    if (!track || !track.id) return;
    btnElement.classList.add('downloading');
    showToast('⬇️ Baixando para o banco local...', 4000);

    try {
      // Usa endpoint para baixar
      const response = await fetch(`/api/download/${track.id}`);
      if (!response.ok) throw new Error('Download falhou');
      
      const rawBlob = await response.blob();
      // Forçamos o tipo para evitar erro de RANGE
      const blob = new Blob([rawBlob], { type: 'audio/webm' });
      const db = await dbPromise;

      await db.put('blobs', blob, track.id);
      await db.put('tracks', track); // Removi o track.id daqui para corrigir o DataError
      
      showToast('✅ Música salva offline com sucesso!');
    } catch (err) {
      console.error(err);
      showToast('❌ Erro no download offline.');
    } finally {
      btnElement.classList.remove('downloading');
    }
  }

  async function deleteTrackOffline(id) {
    const db = await dbPromise;
    await db.delete('blobs', id);
    await db.delete('tracks', id);
    showToast('🗑️ Música removida do offline');
    if (state.view === 'offline') loadOfflineTracks();
  }

  async function loadOfflineTracks() {
    els.offlineTracksList.innerHTML = '';
    els.offlineEmptyState.classList.remove('hidden');
    
    const db = await dbPromise;
    const tracks = await db.getAll('tracks');
    
    if (tracks && tracks.length > 0) {
      els.offlineEmptyState.classList.add('hidden');
      renderTrackList(tracks, els.offlineTracksList, 'offline');
    }
  }

  // --- Playlists (Supabase) Logic ---
  async function loadPlaylists() {
    if (!state.user) {
      els.playlistsList.innerHTML = `<div class="empty-state">Faça login para criar playlists.</div>`;
      return;
    }
    
    els.playlistDetails.classList.add('hidden');
    els.playlistsList.innerHTML = '';
    
    const { data: userPlaylists, error } = await supabase
      .from('playlists')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error(error);
      return;
    }

    state.playlists = userPlaylists || [];

    if (state.playlists.length === 0) {
      els.playlistsList.innerHTML = `<div class="empty-state">Nenhuma playlist. Clique em "Nova Playlist".</div>`;
      return;
    }

    els.playlistsList.innerHTML = state.playlists.map(p => `
      <div class="playlist-card-ui" data-id="${p.id}">
        <h4>${escapeHtml(p.name)}</h4>
      </div>
    `).join('');

    els.playlistsList.querySelectorAll('.playlist-card-ui').forEach(card => {
      card.addEventListener('click', () => loadPlaylistDetails(card.dataset.id));
    });
  }

  els.btnCreatePlaylist.addEventListener('click', async () => {
    if(!state.user) {
      showToast("Faça login primeiro."); return;
    }
    const name = prompt('Nome da nova playlist:');
    if (!name || !name.trim()) return;

    const { error } = await supabase.from('playlists').insert([{ name: name.trim(), user_id: state.user.id }]);
    if (error) showToast('Erro ao criar: ' + error.message);
    else loadPlaylists();
  });

  els.btnBackPlaylists.addEventListener('click', () => {
    els.playlistDetails.classList.add('hidden');
    loadPlaylists();
  });

  async function loadPlaylistDetails(playlistId) {
    const pl = state.playlists.find(p => p.id === playlistId);
    if (!pl) return;

    els.playlistsList.innerHTML = ''; // Hide list
    els.playlistDetails.classList.remove('hidden');
    els.currentPlaylistTitle.textContent = pl.name;
    els.playlistTracksList.innerHTML = '<div class="empty-state">Carregando...</div>';

    const { data: tracks, error } = await supabase
      .from('playlist_tracks')
      .select('*')
      .eq('playlist_id', playlistId)
      .order('added_at', { ascending: true });

    if (error) {
      els.playlistTracksList.innerHTML = `<div class="empty-state">Erro ao carregar faixas.</div>`;
      return;
    }

    // Mapear de volta pro formato local
    const formattedTracks = (tracks || []).map(t => ({
      id: t.video_id, title: t.title, artist: t.artist, thumbnail: t.thumbnail, duration: t.duration, db_id: t.id
    }));

    if (formattedTracks.length === 0) {
      els.playlistTracksList.innerHTML = `<div class="empty-state">Sem músicas ainda.</div>`;
      return;
    }

    renderTrackList(formattedTracks, els.playlistTracksList, 'playlist');
  }

  // --- Modal Add to Playlist ---
  function openAddToPlaylistModal(track) {
    if (!state.user) {
      showToast('Faça login para adicionar às playlists.');
      els.modalAuth.classList.remove('hidden');
      return;
    }
    state.trackToAdd = track;
    els.modalPlaylist.classList.remove('hidden');
    renderModalPlaylists();
  }

  els.btnCloseModalPlaylist.addEventListener('click', () => els.modalPlaylist.classList.add('hidden'));

  async function renderModalPlaylists() {
    els.modalPlaylistsList.innerHTML = 'Carregando...';
    const { data: userPlaylists } = await supabase.from('playlists').select('id, name');
    
    if (!userPlaylists || userPlaylists.length === 0) {
      els.modalPlaylistsList.innerHTML = 'Nenhuma playlist. Crie uma na guia Playlists.';
      return;
    }

    els.modalPlaylistsList.innerHTML = userPlaylists.map(p => `
      <button class="modal-list-item" data-id="${p.id}">${escapeHtml(p.name)}</button>
    `).join('');

    els.modalPlaylistsList.querySelectorAll('.modal-list-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const playlistId = btn.dataset.id;
        const t = state.trackToAdd;
        els.modalPlaylist.classList.add('hidden');
        showToast('Adicionando...', 1000);

        const { error } = await supabase.from('playlist_tracks').insert([{
          playlist_id: playlistId,
          video_id: t.id,
          title: t.title,
          artist: t.artist,
          thumbnail: t.thumbnail,
          duration: t.duration
        }]);

        if (error) showToast('Erro ao adicionar: ' + error.message);
        else showToast('✅ Adicionado à playlist!');
      });
    });
  }

  // --- Master Player Base Logic ---
  async function playTrack(index) {
    if (index < 0 || index >= state.tracks.length) return;
    const track = state.tracks[index];
    state.currentIndex = index;
    state.activeTrackId = track.id;

    // Update Player UI Bar
    els.playerThumbnail.src = track.thumbnail;
    els.playerTitle.textContent = track.title;
    els.playerArtist.textContent = track.artist;
    els.playerTotalTime.textContent = track.duration || '0:00';
    els.playerCurrentTime.textContent = '0:00';
    els.playerProgressBar.style.width = '0%';
    els.playerProgressThumb.style.left = '0%';
    els.playerBar.classList.remove('hidden');

    setPlayerState('loading');
    updateActiveUI();

    // Stop both players first
    if(ytPlayer && ytPlayerReady && typeof ytPlayer.pauseVideo === 'function') {
      try { ytPlayer.pauseVideo(); } catch(e){}
    }
    els.offlineAudio.pause();

    if (state.playingMode === 'offline') {
      try {
        const db = await dbPromise;
        const blob = await db.get('blobs', track.id);
        if (!blob) throw new Error("Offline file missing");
        
        const blobUrl = URL.createObjectURL(blob);
        els.offlineAudio.src = blobUrl;
        els.offlineAudio.load();
        await els.offlineAudio.play();
      } catch (err) {
        showToast("Erro ao abrir faixa offline. Caiu para internet.");
        state.playingMode = 'youtube'; 
        playTrack(index); // Fallback
      }
    } else {
      // YouTube Mode
      if (ytPlayerReady) {
        ytPlayer.loadVideoById(track.id);
      } else {
        showToast('Aguarde plugin carregar...');
        setTimeout(() => { if (ytPlayerReady) ytPlayer.loadVideoById(track.id); }, 1500);
      }
    }
  }

  function setPlayerState(st) {
    els.iconPlay.classList.add('hidden');
    els.iconPause.classList.add('hidden');
    els.iconLoading.classList.add('hidden');

    if (st === 'playing') {
      els.iconPause.classList.remove('hidden');
      state.isPlaying = true;
      state.isLoading = false;
    } else if (st === 'paused') {
      els.iconPlay.classList.remove('hidden');
      state.isPlaying = false;
      state.isLoading = false;
    } else if (st === 'loading') {
      els.iconLoading.classList.remove('hidden');
      state.isLoading = true;
    }
  }

  function togglePlayPause() {
    if (state.isLoading || state.currentIndex === -1) return;
    if (state.isPlaying) {
      if(state.playingMode === 'offline') els.offlineAudio.pause();
      else if(ytPlayerReady) ytPlayer.pauseVideo();
    } else {
      if(state.playingMode === 'offline') els.offlineAudio.play();
      else if(ytPlayerReady) ytPlayer.playVideo();
    }
  }

  function playNext() {
    if (state.tracks.length === 0) return;
    playTrack((state.currentIndex + 1) % state.tracks.length);
  }

  function playPrev() {
    if (state.tracks.length === 0) return;
    
    let currTime = 0;
    if(state.playingMode === 'offline') currTime = els.offlineAudio.currentTime;
    else if(ytPlayerReady) currTime = ytPlayer.getCurrentTime();

    if (currTime > 3) {
      if(state.playingMode === 'offline') els.offlineAudio.currentTime = 0;
      else if(ytPlayerReady) ytPlayer.seekTo(0, true);
      return;
    }
    const prev = state.currentIndex <= 0 ? state.tracks.length - 1 : state.currentIndex - 1;
    playTrack(prev);
  }

  function updateActiveUI() {
    document.querySelectorAll('.track-card').forEach(card => {
      card.classList.toggle('active', card.dataset.id === state.activeTrackId);
    });
  }

  // --- Volume Control ---
  els.volumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if(ytPlayerReady) ytPlayer.setVolume(val);
    els.offlineAudio.volume = val / 100;
  });

  // --- YT Player Callbacks ---
  function onPlayerStateChange(event) {
    if(state.playingMode !== 'youtube') return; // Ignore if playing offline

    if (event.data === YT.PlayerState.PLAYING) {
      setPlayerState('playing');
      startProgressTracking();
      updateMediaSession();
    } else if (event.data === YT.PlayerState.PAUSED) {
      setPlayerState('paused');
      stopProgressTracking();
    } else if (event.data === YT.PlayerState.BUFFERING) {
      setPlayerState('loading');
    } else if (event.data === YT.PlayerState.ENDED) {
      stopProgressTracking();
      playNext();
    }
  }

  // --- Offline Player Events ---
  els.offlineAudio.addEventListener('playing', () => { if(state.playingMode === 'offline') { setPlayerState('playing'); startProgressTracking(); updateMediaSession(); } });
  els.offlineAudio.addEventListener('pause', () => { if(state.playingMode === 'offline') { setPlayerState('paused'); stopProgressTracking(); } });
  els.offlineAudio.addEventListener('waiting', () => { if(state.playingMode === 'offline') setPlayerState('loading'); });
  els.offlineAudio.addEventListener('ended', () => { if(state.playingMode === 'offline') { stopProgressTracking(); playNext(); } });

  // --- Unified Progress Tracking ---
  function startProgressTracking() {
    stopProgressTracking();
    progressInterval = setInterval(() => {
      let currentTime = 0, duration = 0;
      
      if(state.playingMode === 'offline') {
        currentTime = els.offlineAudio.currentTime;
        duration = els.offlineAudio.duration;
      } else if (ytPlayerReady) {
        currentTime = ytPlayer.getCurrentTime() || 0;
        duration = ytPlayer.getDuration() || 0;
      }

      if (duration && isFinite(duration)) {
        const pct = (currentTime / duration) * 100;
        els.playerProgressBar.style.width = `${pct}%`;
        els.playerProgressThumb.style.left = `${pct}%`;
        els.playerCurrentTime.textContent = formatTime(currentTime);
        els.playerTotalTime.textContent = formatTime(duration);
      }
    }, 500);
  }

  function stopProgressTracking() {
    clearInterval(progressInterval);
  }

  // --- Progress Bar Seek ---
  let isSeeking = false;
  function handleSeek(e) {
    const rect = els.playerProgressContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left) / rect.width));
    els.playerProgressBar.style.width = `${pct * 100}%`;
    els.playerProgressThumb.style.left = `${pct * 100}%`;
    
    let duration = 0;
    if(state.playingMode === 'offline') duration = els.offlineAudio.duration;
    else if(ytPlayerReady) duration = ytPlayer.getDuration();

    if (duration && isFinite(duration)) {
      if(state.playingMode === 'offline') els.offlineAudio.currentTime = pct * duration;
      else ytPlayer.seekTo(pct * duration, true);
    }
  }

  els.playerProgressContainer.addEventListener('mousedown', (e) => { isSeeking = true; handleSeek(e); });
  els.playerProgressContainer.addEventListener('touchstart', (e) => { isSeeking = true; handleSeek(e); }, { passive: true });
  document.addEventListener('mousemove', (e) => { if (isSeeking) handleSeek(e); });
  document.addEventListener('touchmove', (e) => { if (isSeeking) handleSeek(e); }, { passive: true });
  document.addEventListener('mouseup', () => { isSeeking = false; });
  document.addEventListener('touchend', () => { isSeeking = false; });

  // --- Media Session API ---
  function updateMediaSession() {
    if ('mediaSession' in navigator && state.currentIndex >= 0 && state.tracks[state.currentIndex]) {
      const t = state.tracks[state.currentIndex];
      const artwork = [];
      if (navigator.onLine && t.thumbnail) {
        artwork.push({ src: t.thumbnail, sizes: '256x256', type: 'image/jpeg' });
      }
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist,
        artwork: artwork
      });
    }
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', togglePlayPause);
    navigator.mediaSession.setActionHandler('pause', togglePlayPause);
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }

  // --- Bind Actions ---
  els.btnPlayPause.addEventListener('click', togglePlayPause);
  els.btnNext.addEventListener('click', playNext);
  els.btnPrev.addEventListener('click', playPrev);
  
  els.btnDownloadCurrent.addEventListener('click', () => {
    if (state.currentIndex >= 0 && state.tracks[state.currentIndex]) {
      saveTrackOffline(state.tracks[state.currentIndex], els.btnDownloadCurrent);
    }
  });

  // Init
  initAuth();
  switchView('home');

})();
