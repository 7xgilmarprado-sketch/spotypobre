// ===== SPOTYPOBRE — Main App Logic =====

(function () {
  'use strict';

  // --- DOM Elements ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    searchInput: $('#search-input'),
    searchClear: $('#search-clear'),
    searchBox: $('#search-box'),
    welcomeScreen: $('#welcome-screen'),
    loadingState: $('#loading-state'),
    resultsContainer: $('#results-container'),
    resultsList: $('#results-list'),
    resultsTitle: $('#results-title'),
    resultsCount: $('#results-count'),
    errorState: $('#error-state'),
    errorMessage: $('#error-message'),
    errorRetry: $('#error-retry'),
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
    iconPlay: $('#icon-play'),
    iconPause: $('#icon-pause'),
    iconLoading: $('#icon-loading'),
    toast: $('#toast'),
    toastMessage: $('#toast-message'),
    logo: $('#logo'),
  };

  // --- State ---
  const state = {
    tracks: [],
    currentIndex: -1,
    isPlaying: false,
    isLoading: false,
    lastQuery: '',
    searchTimeout: null,
  };

  let ytPlayer = null;
  let ytPlayerReady = false;
  let progressInterval = null;

  window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      videoId: '',
      playerVars: {
        'playsinline': 1,
        'controls': 0,
        'disablekb': 1,
        'fs': 0,
        'iv_load_policy': 3,
        'rel': 0,
        'modestbranding': 1
      },
      events: {
        'onReady': () => { ytPlayerReady = true; },
        'onStateChange': onPlayerStateChange,
        'onError': onPlayerError
      }
    });
  };

  function updateMediaSession() {
    if ('mediaSession' in navigator && state.currentIndex >= 0) {
      const track = state.tracks[state.currentIndex];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: [
          { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: track.thumbnail, sizes: '128x128', type: 'image/jpeg' },
          { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
        ]
      });
    }
  }

  function onPlayerStateChange(event) {
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

  function onPlayerError(event) {
    console.error('YT Player error:', event.data);
    setPlayerState('paused');
    showToast('❌ Erro ao carregar faixa a partir do YouTube');
  }

  function startProgressTracking() {
    stopProgressTracking();
    progressInterval = setInterval(() => {
      if (!ytPlayer || !ytPlayerReady) return;
      const currentTime = ytPlayer.getCurrentTime() || 0;
      const duration = ytPlayer.getDuration() || 0;
      
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
    // Force reflow for animation
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

  // --- UI State Management ---
  function showSection(section) {
    els.welcomeScreen.classList.add('hidden');
    els.loadingState.classList.add('hidden');
    els.resultsContainer.classList.add('hidden');
    els.errorState.classList.add('hidden');

    switch (section) {
      case 'welcome':
        els.welcomeScreen.classList.remove('hidden');
        break;
      case 'loading':
        els.loadingState.classList.remove('hidden');
        break;
      case 'results':
        els.resultsContainer.classList.remove('hidden');
        break;
      case 'error':
        els.errorState.classList.remove('hidden');
        break;
    }
  }

  // --- Search ---
  async function performSearch(query) {
    if (!query.trim()) {
      showSection('welcome');
      return;
    }

    state.lastQuery = query.trim();
    showSection('loading');

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      state.tracks = data.tracks || [];

      if (state.tracks.length === 0) {
        els.errorMessage.textContent = `Nenhum resultado para "${query.trim()}"`;
        showSection('error');
        return;
      }

      renderResults(state.tracks);
      showSection('results');
    } catch (err) {
      console.error('Search failed:', err);
      els.errorMessage.textContent = 'Não foi possível buscar. Verifique sua conexão e tente novamente.';
      showSection('error');
    }
  }

  // --- Render Results ---
  function renderResults(tracks) {
    els.resultsTitle.textContent = `Resultados para "${state.lastQuery}"`;
    els.resultsCount.textContent = `${tracks.length} músicas`;

    els.resultsList.innerHTML = tracks.map((track, i) => `
      <div class="track-card ${state.currentIndex === i ? 'active' : ''}"
           data-index="${i}" 
           id="track-${i}" 
           role="button" 
           tabindex="0">
        <div class="track-card-number">
          <span class="num-text">${i + 1}</span>
          <div class="playing-bars">
            <span class="playing-bar"></span>
            <span class="playing-bar"></span>
            <span class="playing-bar"></span>
            <span class="playing-bar"></span>
          </div>
        </div>
        <div class="track-thumbnail-wrapper">
          <img class="track-thumbnail" 
               src="${escapeAttr(track.thumbnail)}" 
               alt="${escapeAttr(track.title)}"
               loading="lazy"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><rect fill=%22%23282828%22 width=%2248%22 height=%2248%22/><text x=%2224%22 y=%2228%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2216%22>♪</text></svg>'">
          <div class="track-play-overlay">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="track-info">
          <div class="track-title">${escapeHtml(track.title)}</div>
          <div class="track-artist">${escapeHtml(track.artist)}</div>
        </div>
        <span class="track-duration">${escapeHtml(track.duration)}</span>
        <button class="track-download-btn" 
                data-id="${escapeAttr(track.id)}" 
                data-title="${escapeAttr(track.title)}"
                aria-label="Baixar ${escapeAttr(track.title)}"
                onclick="event.stopPropagation()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M12 3v12M12 15l-4-4M12 15l4-4M5 20h14"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Bind track click events
    els.resultsList.querySelectorAll('.track-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const idx = parseInt(card.dataset.index);
        playTrack(idx);
      });
    });

    // Bind download button events
    els.resultsList.querySelectorAll('.track-download-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadTrack(btn.dataset.id, btn.dataset.title, btn);
      });
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s || '';
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- Player ---
  function playTrack(index) {
    if (index < 0 || index >= state.tracks.length) return;

    const track = state.tracks[index];
    state.currentIndex = index;

    // Update player UI
    els.playerThumbnail.src = track.thumbnail;
    els.playerThumbnail.alt = track.title;
    els.playerTitle.textContent = track.title;
    els.playerArtist.textContent = track.artist;
    els.playerTotalTime.textContent = track.duration || '0:00';
    els.playerCurrentTime.textContent = '0:00';
    els.playerProgressBar.style.width = '0%';
    els.playerProgressThumb.style.left = '0%';

    // Show player
    els.playerBar.classList.remove('hidden');

    // Set loading state
    setPlayerState('loading');

    // Load and play via YouTube IFrame
    if (ytPlayerReady) {
      ytPlayer.loadVideoById(track.id);
    } else {
      showToast('Carregando player do YouTube...');
      // Allow it to retry briefly if API just loaded
      setTimeout(() => {
        if (ytPlayerReady) ytPlayer.loadVideoById(track.id);
      }, 1500);
    }

    // Highlight active track
    updateActiveTrack();
  }

  function setPlayerState(playerState) {
    els.iconPlay.classList.add('hidden');
    els.iconPause.classList.add('hidden');
    els.iconLoading.classList.add('hidden');

    switch (playerState) {
      case 'playing':
        els.iconPause.classList.remove('hidden');
        state.isPlaying = true;
        state.isLoading = false;
        break;
      case 'paused':
        els.iconPlay.classList.remove('hidden');
        state.isPlaying = false;
        state.isLoading = false;
        break;
      case 'loading':
        els.iconLoading.classList.remove('hidden');
        state.isLoading = true;
        break;
    }
  }

  function updateActiveTrack() {
    els.resultsList.querySelectorAll('.track-card').forEach(card => {
      const idx = parseInt(card.dataset.index);
      card.classList.toggle('active', idx === state.currentIndex);
    });
  }

  function togglePlayPause() {
    if (state.isLoading) return;
    if (!ytPlayerReady || state.currentIndex === -1) return;

    if (state.isPlaying) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  }

  function playNext() {
    if (state.tracks.length === 0) return;
    const next = (state.currentIndex + 1) % state.tracks.length;
    playTrack(next);
  }

  function playPrev() {
    if (state.tracks.length === 0) return;
    // If more than 3 seconds in, restart current track
    if (ytPlayerReady && ytPlayer.getCurrentTime() > 3) {
      ytPlayer.seekTo(0, true);
      return;
    }
    const prev = state.currentIndex <= 0 ? state.tracks.length - 1 : state.currentIndex - 1;
    playTrack(prev);
  }

  // --- Download ---
  function downloadTrack(videoId, title, btnElement) {
    if (!videoId) return;

    if (btnElement) {
      btnElement.classList.add('downloading');
    }

    showToast('⬇️ Iniciando download...');

    const a = document.createElement('a');
    a.href = `/api/download/${videoId}`;
    a.download = `${title || 'music'}.webm`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      if (btnElement) btnElement.classList.remove('downloading');
      showToast('✅ Download iniciado!');
    }, 2000);
  }

  // --- Progress Bar Seek ---
  let isSeeking = false;

  function handleSeek(e) {
    const rect = els.playerProgressContainer.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    
    els.playerProgressBar.style.width = `${pct * 100}%`;
    els.playerProgressThumb.style.left = `${pct * 100}%`;
    
    if (ytPlayerReady) {
      const duration = ytPlayer.getDuration();
      if (duration && isFinite(duration)) {
        ytPlayer.seekTo(pct * duration, true);
        if (!state.isPlaying) ytPlayer.playVideo();
      }
    }
  }

  els.playerProgressContainer.addEventListener('mousedown', (e) => {
    isSeeking = true;
    handleSeek(e);
  });

  els.playerProgressContainer.addEventListener('touchstart', (e) => {
    isSeeking = true;
    handleSeek(e);
  }, { passive: true });

  document.addEventListener('mousemove', (e) => {
    if (isSeeking) handleSeek(e);
  });

  document.addEventListener('touchmove', (e) => {
    if (isSeeking) handleSeek(e);
  }, { passive: true });

  document.addEventListener('mouseup', () => { isSeeking = false; });
  document.addEventListener('touchend', () => { isSeeking = false; });

  // --- Search Events ---
  const debouncedSearch = debounce((q) => performSearch(q), 600);

  els.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    els.searchClear.classList.toggle('hidden', val.length === 0);
    if (val.trim().length >= 2) {
      debouncedSearch(val);
    } else if (val.trim().length === 0) {
      showSection('welcome');
    }
  });

  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = els.searchInput.value.trim();
      if (val.length >= 2) {
        performSearch(val);
      }
    }
  });

  els.searchClear.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchClear.classList.add('hidden');
    els.searchInput.focus();
    showSection('welcome');
  });

  // --- Player Controls ---
  els.btnPlayPause.addEventListener('click', togglePlayPause);
  els.btnNext.addEventListener('click', playNext);
  els.btnPrev.addEventListener('click', playPrev);

  els.btnDownloadCurrent.addEventListener('click', () => {
    if (state.currentIndex >= 0 && state.tracks[state.currentIndex]) {
      const track = state.tracks[state.currentIndex];
      downloadTrack(track.id, track.title);
    }
  });

  // --- Error Retry ---
  els.errorRetry.addEventListener('click', () => {
    if (state.lastQuery) {
      performSearch(state.lastQuery);
    } else {
      showSection('welcome');
    }
  });

  // --- Logo Click (Home) ---
  els.logo.addEventListener('click', () => {
    els.searchInput.value = '';
    els.searchClear.classList.add('hidden');
    showSection('welcome');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // --- Tag Buttons ---
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const search = btn.dataset.search;
      if (search) {
        els.searchInput.value = search;
        els.searchClear.classList.remove('hidden');
        performSearch(search);
      }
    });
  });

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    // Space to play/pause (only if not typing in search)
    if (e.code === 'Space' && document.activeElement !== els.searchInput) {
      e.preventDefault();
      togglePlayPause();
    }

    // Focus search with /
    if (e.key === '/' && document.activeElement !== els.searchInput) {
      e.preventDefault();
      els.searchInput.focus();
    }

    // Escape unfocus search
    if (e.key === 'Escape') {
      els.searchInput.blur();
    }
  });

  // --- Media Session API (lock screen controls) ---
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => { if (ytPlayerReady) ytPlayer.playVideo(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (ytPlayerReady) ytPlayer.pauseVideo(); });
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }

  // --- Service Worker ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/js/sw.js').catch(() => {
      // Service worker registration failed, not critical
    });
  }

  // --- Init ---
  showSection('welcome');
  console.log('%c🎵 Spotypobre', 'font-size: 24px; font-weight: bold; color: #1DB954;');
  console.log('%cMúsica pra todo mundo!', 'font-size: 14px; color: #b3b3b3;');

})();
