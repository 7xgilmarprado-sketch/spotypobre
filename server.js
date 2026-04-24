const express = require('express');
const { Innertube } = require('youtubei.js');
const youtubedl = require('youtube-dl-exec');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

let youtube;

// Initialize YouTube instance once
async function initYoutube() {
  if (!youtube) {
    youtube = await Innertube.create();
  }
  return youtube;
}

// --- API Routes ---

// Search YouTube using YouTubei.js (Best for Vercel)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const yt = await initYoutube();
    const results = await yt.search(query, { type: 'video' });
    
    // Filtra apenas o que é vídeo e mapeia para o nosso formato
    const tracks = results.videos.map(video => ({
      id: video.id,
      title: video.title.text || 'Sem título',
      artist: video.author.name || 'Artista desconhecido',
      thumbnail: video.thumbnails[0].url || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      duration: video.duration.text || '0:00',
      durationSec: video.duration.seconds || 0,
      url: `https://www.youtube.com/watch?v=${video.id}`
    }));

    res.json({ tracks });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Erro na busca: ' + error.message });
  }
});

// Stream audio using yt-dlp redirect
app.get('/api/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const audioUrl = await youtubedl(url, {
      getUrl: true,
      format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      noWarnings: true,
      noPlaylist: true,
      noCheckCertificates: true
    });

    if (audioUrl) {
      return res.redirect(302, audioUrl);
    } else {
      throw new Error('Streaming URL not found');
    }
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Streaming falhou.' });
  }
});

// Download audio pipeline for Offline storage
app.get('/api/download/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    res.setHeader('Content-Type', 'audio/webm');
    
    const dlProcess = youtubedl.exec(url, {
      format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      output: '-',
      noWarnings: true,
      noPlaylist: true
    });

    dlProcess.stdout.pipe(res);

    dlProcess.catch((error) => {
      console.error('Download error:', error);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
    });

    req.on('close', () => {
      if (dlProcess.child) dlProcess.child.kill();
    });
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed.' });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server conditionally
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n🎵 Spotypobre rodando na porta ${PORT}\n`);
  });
}

module.exports = app;
