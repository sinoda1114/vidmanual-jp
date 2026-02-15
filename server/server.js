/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

require('dotenv').config();
// ルートの .env / .env.local を読む（server/ から起動しても API キーが使えるように）
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const https = require('https');
const path = require('path');
const WebSocket = require('ws');
const { URLSearchParams, URL } = require('url');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;
const externalApiBaseUrl = 'https://generativelanguage.googleapis.com';
const externalWsBaseUrl = 'wss://generativelanguage.googleapis.com';
// Support either API key env-var variant
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

const staticPath = path.join(__dirname,'dist');
const publicPath = path.join(__dirname,'public');


if (!apiKey) {
    // Only log an error, don't exit. The server will serve apps without proxy functionality
    console.error("Warning: GEMINI_API_KEY or API_KEY environment variable is not set! Proxy functionality will be disabled.");
}
else {
  console.log("API KEY FOUND (proxy will use this)")
}

app.set('trust proxy', 1 /* number of proxies between user and server */);

// Rate limiter for the proxy (must be before body parsers so /api-proxy gets raw body)
const proxyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Set ratelimit window at 15min (in ms)
    max: 100, // Limit each IP to 100 requests per window
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}. Path: ${req.path}`);
        res.status(options.statusCode).send(options.message);
    }
});

// /api-proxy: stream request body to Gemini (no body parser here)
app.use('/api-proxy', proxyLimiter);
app.use('/api-proxy', async (req, res, next) => {
    if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
        return next();
    }
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Goog-Api-Key');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.sendStatus(200);
    }

    // #region agent log
    const debugPayload = {
        location: 'server.js:api-proxy',
        message: 'Proxy request',
        data: {
            method: req.method,
            url: req.url,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            hypothesisId: 'H2_H3_H5',
        },
        timestamp: Date.now(),
        runId: 'proxy-upload',
    };
    fetch('http://127.0.0.1:7247/ingest/98560d42-bda4-466e-800a-b2a3e63b3d2e', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(debugPayload) }).catch(() => {});
    console.log('[DEBUG] Proxy req:', req.method, req.url, 'Content-Type:', req.headers['content-type'], 'Content-Length:', req.headers['content-length']);
    // #endregion

    try {
        const targetPath = req.url.startsWith('/') ? req.url.substring(1) : req.url;
        let apiUrl = `${externalApiBaseUrl}/${targetPath}`;
        if (apiKey) {
            const sep = apiUrl.includes('?') ? '&' : '?';
            apiUrl = `${apiUrl}${sep}key=${encodeURIComponent(apiKey)}`;
        }
        console.log(`HTTP Proxy: ${req.method} ${apiUrl}`);

        const outgoingHeaders = {};
        for (const header in req.headers) {
            if (!['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-extensions'].includes(header.toLowerCase())) {
                outgoingHeaders[header] = req.headers[header];
            }
        }
        outgoingHeaders['X-Goog-Api-Key'] = apiKey;
        if (req.headers['content-type'] && ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
            outgoingHeaders['Content-Type'] = req.headers['content-type'];
        } else if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
            outgoingHeaders['Content-Type'] = 'application/json';
        }
        if (['GET', 'DELETE'].includes(req.method.toUpperCase())) {
            delete outgoingHeaders['Content-Type'];
            delete outgoingHeaders['content-type'];
        }
        if (!outgoingHeaders['accept']) {
            outgoingHeaders['accept'] = '*/*';
        }

        // #region agent log
        console.log('[DEBUG] Outgoing headers:', JSON.stringify({ 'Content-Type': outgoingHeaders['Content-Type'], 'Content-Length': outgoingHeaders['Content-Length'], 'X-Goog-Api-Key': outgoingHeaders['X-Goog-Api-Key'] ? '(set)' : '(missing)' }));
        // #endregion

        const axiosConfig = {
            method: req.method,
            url: apiUrl,
            headers: outgoingHeaders,
            responseType: 'stream',
            validateStatus: function (status) {
                return true;
            },
        };
        // Stream raw body (JSON or binary file) so file upload works
        if (['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
            axiosConfig.data = req;
        }

        const apiResponse = await axios(axiosConfig);

        // Pass through response headers from Gemini API to the client
        for (const header in apiResponse.headers) {
            res.setHeader(header, apiResponse.headers[header]);
        }
        res.status(apiResponse.status);

        // #region agent log
        if (apiResponse.status >= 400) {
            const chunks = [];
            apiResponse.data.on('data', (c) => chunks.push(c));
            apiResponse.data.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                console.log('[DEBUG] Upstream error', apiResponse.status, 'body:', body);
                if (!res.headersSent) res.setHeader('Content-Type', apiResponse.headers['content-type'] || 'application/json');
                res.send(body);
            });
            apiResponse.data.on('error', (err) => {
                console.error('[DEBUG] Upstream stream error:', err);
                if (!res.headersSent) res.status(500).json({ error: 'Proxy stream error' });
                else res.end();
            });
            return;
        }
        // #endregion

        apiResponse.data.on('data', (chunk) => {
            res.write(chunk);
        });

        apiResponse.data.on('end', () => {
            res.end();
        });

        apiResponse.data.on('error', (err) => {
            console.error('Error during streaming data from target API:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Proxy error during streaming from target' });
            } else {
                // If headers already sent, we can't send a JSON error, just end the response.
                res.end();
            }
        });

    } catch (error) {
        console.error('Proxy error before request to target API:', error);
        if (!res.headersSent) {
            if (error.response) {
                const errorData = {
                    status: error.response.status,
                    message: error.response.data?.error?.message || 'Proxy error from upstream API',
                    details: error.response.data?.error?.details || null
                };
                res.status(error.response.status).json(errorData);
            } else {
                res.status(500).json({ error: 'Proxy setup error', message: error.message });
            }
        }
    }
});

// Body parsers for non-proxy routes (must be after /api-proxy so proxy gets raw body)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const webSocketInterceptorScriptTag = `<script src="/public/websocket-interceptor.js" defer></script>`;

// Prepare service worker registration script content
const serviceWorkerRegistrationScript = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load' , () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('Service Worker registered successfully with scope:', registration.scope);
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });
  });
} else {
  console.log('Service workers are not supported in this browser.');
}
</script>
`;

// Serve index.html or placeholder based on API key and file availability
app.get('/', (req, res) => {
    const placeholderPath = path.join(publicPath, 'placeholder.html');

    // Try to serve index.html
    console.log("LOG: Route '/' accessed. Attempting to serve index.html.");
    const indexPath = path.join(staticPath, 'index.html');

    fs.readFile(indexPath, 'utf8', (err, indexHtmlData) => {
        if (err) {
            // index.html not found or unreadable, serve the original placeholder
            console.log('LOG: index.html not found or unreadable. Falling back to original placeholder.');
            return res.sendFile(placeholderPath);
        }

        // If API key is not set, serve original HTML without injection
        if (!apiKey) {
          console.log("LOG: API key not set. Serving original index.html without script injections.");
          return res.sendFile(indexPath);
        }

        // index.html found and apiKey set, inject scripts
        console.log("LOG: index.html read successfully. Injecting scripts.");
        let injectedHtml = indexHtmlData;


        if (injectedHtml.includes('<head>')) {
            // Inject WebSocket interceptor first, then service worker script
            injectedHtml = injectedHtml.replace(
                '<head>',
                `<head>${webSocketInterceptorScriptTag}${serviceWorkerRegistrationScript}`
            );
            console.log("LOG: Scripts injected into <head>.");
        } else {
            console.warn("WARNING: <head> tag not found in index.html. Prepending scripts to the beginning of the file as a fallback.");
            injectedHtml = `${webSocketInterceptorScriptTag}${serviceWorkerRegistrationScript}${indexHtmlData}`;
        }
        res.send(injectedHtml);
    });
});

app.get('/service-worker.js', (req, res) => {
   return res.sendFile(path.join(publicPath, 'service-worker.js'));
});

app.use('/public', express.static(publicPath));
app.use(express.static(staticPath));

// Start the HTTP server
const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`HTTP proxy active on /api-proxy/**`);
    console.log(`WebSocket proxy active on /api-proxy/**`);
});

// Create WebSocket server and attach it to the HTTP server
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith('/api-proxy/')) {
        if (!apiKey) {
            console.error("WebSocket proxy: API key not configured. Closing connection.");
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (clientWs) => {
            console.log('Client WebSocket connected to proxy for path:', pathname);

            const targetPathSegment = pathname.substring('/api-proxy'.length);
            const clientQuery = new URLSearchParams(requestUrl.search);
            clientQuery.set('key', apiKey);
            const targetGeminiWsUrl = `${externalWsBaseUrl}${targetPathSegment}?${clientQuery.toString()}`;
            console.log(`Attempting to connect to target WebSocket: ${targetGeminiWsUrl}`);

            const geminiWs = new WebSocket(targetGeminiWsUrl, {
                protocol: request.headers['sec-websocket-protocol'],
            });

            const messageQueue = [];

            geminiWs.on('open', () => {
                console.log('Proxy connected to Gemini WebSocket');
                // Send any queued messages
                while (messageQueue.length > 0) {
                    const message = messageQueue.shift();
                    if (geminiWs.readyState === WebSocket.OPEN) {
                        // console.log('Sending queued message from client -> Gemini');
                        geminiWs.send(message);
                    } else {
                        // Should not happen if we are in 'open' event, but good for safety
                        console.warn('Gemini WebSocket not open when trying to send queued message. Re-queuing.');
                        messageQueue.unshift(message); // Add it back to the front
                        break; // Stop processing queue for now
                    }
                }
            });

            geminiWs.on('message', (message) => {
                // console.log('Message from Gemini -> client');
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(message);
                }
            });

            geminiWs.on('close', (code, reason) => {
                console.log(`Gemini WebSocket closed: ${code} ${reason.toString()}`);
                if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
                    clientWs.close(code, reason.toString());
                }
            });

            geminiWs.on('error', (error) => {
                console.error('Error on Gemini WebSocket connection:', error);
                if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
                    clientWs.close(1011, 'Upstream WebSocket error');
                }
            });

            clientWs.on('message', (message) => {
                if (geminiWs.readyState === WebSocket.OPEN) {
                    // console.log('Message from client -> Gemini');
                    geminiWs.send(message);
                } else if (geminiWs.readyState === WebSocket.CONNECTING) {
                    // console.log('Queueing message from client -> Gemini (Gemini still connecting)');
                    messageQueue.push(message);
                } else {
                    console.warn('Client sent message but Gemini WebSocket is not open or connecting. Message dropped.');
                }
            });

            clientWs.on('close', (code, reason) => {
                console.log(`Client WebSocket closed: ${code} ${reason.toString()}`);
                if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
                    geminiWs.close(code, reason.toString());
                }
            });

            clientWs.on('error', (error) => {
                console.error('Error on client WebSocket connection:', error);
                if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
                    geminiWs.close(1011, 'Client WebSocket error');
                }
            });
        });
    } else {
        console.log(`WebSocket upgrade request for non-proxy path: ${pathname}. Closing connection.`);
        socket.destroy();
    }
});
