const express = require('express');
const youtubedl = require('youtube-dl-exec');
const youtubeSearch = require('youtube-search-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

// Search YouTube
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  try {
    const results = await youtubeSearch.GetListByKeyword(query, false, 20, [{ type: 'video' }]);

    const tracks = (results.items || [])
      .filter(item => item.type === 'video')
      .map(video => ({
        id: video.id,
        title: video.title || 'Sem título',
        artist: video.channelTitle || video.channelName || 'Artista desconhecido',
        thumbnail: video.thumbnail?.thumbnails?.[0]?.url
          || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
        duration: video.length?.simpleText || video.duration || '0:00',
        durationSec: parseDuration(video.length?.simpleText || video.duration || '0:00'),
        url: `https://www.youtube.com/watch?v=${video.id}`
      }));

    res.json({ tracks });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: 'Failed to search. Try again.' });
  }
});

// Stream audio using yt-dlp (redirects to avoid Vercel 10s serverless limits)
app.get('/api/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

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
      // Vercel Serverless limits to 10s execution. 
      // Redirecting to Google's audio URL lets the browser handle streaming without timeouts.
      return res.redirect(302, audioUrl);
    } else {
      throw new Error('A URL de áudio não foi encontrada');
    }
  } catch (error) {
    console.error('Stream error:', error.stack || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to access stream url.' });
    }
  }
});

// Download audio using yt-dlp
app.get('/api/download/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const titleObj = await youtubedl(url, {
      dumpJson: true,
      noWarnings: true,
      noPlaylist: true,
    });
    
    const title = titleObj.title || 'download';
    const safeTitle = title.replace(/[<>:"/\\|?*]/g, '').trim();

    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.webm"`);

    const dlProcess = youtubedl.exec(url, {
      format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      output: '-',
      noWarnings: true,
      noPlaylist: true
    });

    dlProcess.stdout.pipe(res);

    dlProcess.catch((error) => {
      console.error('yt-dlp download error:', error.stack || error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    });

    req.on('close', () => {
      if (dlProcess.child) dlProcess.child.kill();
    });

  } catch (error) {
    console.error('Download error:', error.stack || error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download.' });
    }
  }
});

// Utility: parse "M:SS" or "H:MM:SS" to seconds
function parseDuration(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎵 Spotypobre rodando na porta ${PORT}\n`);
});
