const express = require('express');
const { spawn } = require('child_process');
const youtubeSearch = require('youtube-search-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Path to yt-dlp binary (bundled with youtube-dl-exec)
const YT_DLP = path.join(__dirname, 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');

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

// Stream audio using yt-dlp (pipe through server to avoid CORS)
app.get('/api/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;

  // Validate video ID format
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Set headers for audio streaming
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Pipe audio directly from yt-dlp stdout to response
    const ytdlp = spawn(YT_DLP, [
      '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      '-o', '-',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      url
    ]);

    let hasData = false;

    ytdlp.stdout.on('data', () => {
      hasData = true;
    });

    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on('data', (data) => {
      const msg = data.toString();
      // Only log actual errors, not download progress
      if (!msg.includes('[download]') && !msg.includes('%') && !msg.includes('[info]') && !msg.includes('[youtube]')) {
        console.error('yt-dlp stream stderr:', msg.trim());
      }
    });

    ytdlp.on('close', (code) => {
      if (code !== 0 && !hasData) {
        console.error(`yt-dlp stream exited with code ${code}`);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream audio' });
        }
      }
    });

    ytdlp.on('error', (err) => {
      console.error('yt-dlp spawn error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start audio extraction' });
      }
    });

    // Handle client disconnect — kill yt-dlp process
    req.on('close', () => {
      ytdlp.kill('SIGTERM');
    });
  } catch (error) {
    console.error('Stream error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio.' });
    }
  }
});

// Download audio using yt-dlp (pipe through server)
app.get('/api/download/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // First get the title
    const getTitle = spawn(YT_DLP, [
      '--get-title',
      '--no-warnings',
      '--no-playlist',
      url
    ]);

    let title = '';
    getTitle.stdout.on('data', (data) => {
      title += data.toString().trim();
    });

    getTitle.on('close', () => {
      const safeTitle = (title || 'download').replace(/[<>:"/\\|?*]/g, '').trim();

      // Set download headers
      res.setHeader('Content-Type', 'audio/webm');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.webm"`);

      // Stream the audio through yt-dlp to stdout
      const dl = spawn(YT_DLP, [
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        '-o', '-',
        '--no-warnings',
        '--no-playlist',
        url
      ]);

      dl.stdout.pipe(res);

      dl.stderr.on('data', (data) => {
        const msg = data.toString();
        if (!msg.includes('[download]') && !msg.includes('%')) {
          console.error('yt-dlp download stderr:', msg);
        }
      });

      dl.on('close', (code) => {
        if (code !== 0 && !res.writableEnded) {
          console.error(`yt-dlp download exited with code ${code}`);
        }
      });

      dl.on('error', (err) => {
        console.error('yt-dlp download spawn error:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Download failed' });
        }
      });

      req.on('close', () => {
        dl.kill();
      });
    });

    getTitle.on('error', (err) => {
      console.error('yt-dlp title error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to get title' });
      }
    });
  } catch (error) {
    console.error('Download error:', error.message);
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
  console.log(`\n🎵 Spotypobre rodando em http://localhost:${PORT}`);
  console.log(`📦 yt-dlp: ${YT_DLP}\n`);
});
