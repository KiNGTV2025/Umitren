import express from 'express';
import { Buffer } from 'buffer';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/proxy/ts', async (req, res) => {
  const encoded = req.query.url;
  if (!encoded) return res.status(400).send('URL eksik');

  const decodedUrl = Buffer.from(encoded, 'base64').toString('utf-8');

  try {
    const response = await fetch(decodedUrl, {
      headers: {
        'Referer': 'https://vavoo.to/',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!response.ok) throw new Error('Segment alınamadı');

    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    response.body.pipe(res);
  } catch (error) {
    console.error('TS segment proxy hatası:', error);
    res.status(500).send('Segment alınamadı');
  }
});

app.get('/m3u8/:id', async (req, res) => {
  const id = req.params.id.replace(/[^a-zA-Z0-9]/g, '');
  const playUrl = `https://vavoo.to/vavoo-iptv/play/${id}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0');
    await page.setExtraHTTPHeaders({
      Referer: 'https://vavoo.to/',
      Origin: 'https://vavoo.to',
    });

    await page.goto(playUrl, { waitUntil: 'networkidle2' });

    const realUrl = await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) return video.src;

      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        if (link.href && link.href.includes('.m3u8')) return link.href;
      }

      return null;
    });

    if (!realUrl) throw new Error('M3U8 linki bulunamadı');

    console.log('Gerçek M3U8 URL:', realUrl);

    const m3u8Response = await fetch(realUrl, {
      headers: {
        Referer: 'https://vavoo.to/',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!m3u8Response.ok) throw new Error('M3U8 dosyası alınamadı');

    const m3u8Text = await m3u8Response.text();

    const base = realUrl.substring(0, realUrl.lastIndexOf('/') + 1);

    const proxied = m3u8Text.replace(/^(.+\.ts)$/gm, (line) => {
      const fullUrl = base + line.trim();
      const encoded = Buffer.from(fullUrl).toString('base64');
      return `${req.protocol}://${req.get('host')}/proxy/ts?url=${encodeURIComponent(encoded)}`;
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(proxied);

  } catch (err) {
    console.error('M3U8 işleme hatası:', err);
    res.status(500).send('M3U8 işlenemedi');
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
