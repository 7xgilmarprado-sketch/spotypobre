const express = require('express');
const yts = require('yt-search');
const youtubedl = require('youtube-dl-exec');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files - No Vercel, o Vercel já serve a pasta public automaticamente 
// se configurado no vercel.json, mas deixamos aqui para o local funcionar.
app.use(express.static(path.join(__dirname, '../public')));

// Ping route para testar se a API está viva no Vercel
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor Spotypobre está vivo!', time: new Date() });
});

// Search YouTube using yt-search
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query param "q" required' });

  try {
    const results = await yts(query);
    const videos = results.videos.slice(0, 20);

    const tracks = videos.map(video => ({
      id: video.videoId,
      title: video.title,
      artist: video.author.name,
      thumbnail: video.thumbnail || video.image,
      duration: video.timestamp,
      durationSec: video.seconds,
      url: video.url
    }));

    res.json({ tracks });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
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
    if (audioUrl) return res.redirect(302, audioUrl);
    throw new Error('URL not found');
  } catch (error) {
    res.status(500).json({ error: 'Streaming failed' });
  }
});

// Download audio pipeline
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
    req.on('close', () => { if (dlProcess.child) dlProcess.child.kill(); });
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Start server conditionally
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`\n🎵 Spotypobre rodando na porta ${PORT}\n`));
}

module.exports = app;
