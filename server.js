import express from 'express';
import axios from 'axios';
import { Buffer } from 'buffer';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/proxy/ts', async (req, res) => {
    const encoded = req.query.url;
    if (!encoded) return res.status(400).send('URL eksik');

    const decodedUrl = Buffer.from(encoded, 'base64').toString('utf-8');
    try {
        const response = await axios.get(decodedUrl, {
            responseType: 'stream',
            headers: {
                'Referer': 'https://vavoo.to/',
                'User-Agent': 'Mozilla/5.0',
                'Origin': 'https://vavoo.to'
            }
        });
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        response.data.pipe(res);
    } catch (error) {
        console.error('TS segment proxy hatası:', error.response?.status, error.message);
        res.status(500).send('Segment alınamadı');
    }
});

app.get('/m3u8/:id', async (req, res) => {
    const id = req.params.id.replace(/[^a-zA-Z0-9]/g, '');
    const playUrl = `https://vavoo.to/vavoo-iptv/play/${id}`;

    try {
        const redirectResponse = await axios.get(playUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://vavoo.to/',
                'Origin': 'https://vavoo.to'
            }
        });

        const realUrl = redirectResponse.request.res.responseUrl || redirectResponse.headers.location;
        if (!realUrl) throw new Error("Yönlendirme bulunamadı");

        console.log('Redirect URL:', realUrl);

        const m3u8Response = await axios.get(realUrl, {
            headers: {
                'Referer': 'https://vavoo.to/',
                'User-Agent': 'Mozilla/5.0',
                'Origin': 'https://vavoo.to'
            }
        });

        const base = realUrl.substring(0, realUrl.lastIndexOf('/') + 1);
        const proxied = m3u8Response.data.replace(/^(.+\.ts)$/gm, (line) => {
            const fullUrl = base + line.trim();
            const encoded = Buffer.from(fullUrl).toString('base64');
            return `${req.protocol}://${req.get('host')}/proxy/ts?url=${encodeURIComponent(encoded)}`;
        });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(proxied);
    } catch (err) {
        console.error('M3U8 işleme hatası:', err.response?.status, err.message);
        res.status(500).send('M3U8 işlenemedi');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
