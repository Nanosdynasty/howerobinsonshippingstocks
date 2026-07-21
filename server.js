const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const DIRECTORY = __dirname;

// Dynamic load of companies from JSON files
let COMPANIES = [];
let UNRESOLVED_COMPANIES = [];

try {
  const resolvedPath = path.join(DIRECTORY, 'resolved_companies.json');
  if (fs.existsSync(resolvedPath)) {
    COMPANIES = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    console.log(`Loaded ${COMPANIES.length} resolved shipping companies.`);
  }
} catch (err) {
  console.error("Failed to load resolved_companies.json:", err.message);
}

try {
  const unresolvedPath = path.join(DIRECTORY, 'unresolved_companies.json');
  if (fs.existsSync(unresolvedPath)) {
    UNRESOLVED_COMPANIES = JSON.parse(fs.readFileSync(unresolvedPath, 'utf8'));
    console.log(`Loaded ${UNRESOLVED_COMPANIES.length} unresolved shipping companies.`);
  }
} catch (err) {
  console.error("Failed to load unresolved_companies.json:", err.message);
}

// Persistent in-memory cache
let cache = {
  stocks: {} // symbol -> stock metrics
};

const CACHE_FILE = path.join(DIRECTORY, 'stock_cache.json');
if (fs.existsSync(CACHE_FILE)) {
  try {
    cache.stocks = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    // Filter out stale or modified ticker symbols
    const activeSymbols = new Set(COMPANIES.map(c => c.symbol));
    for (const sym in cache.stocks) {
      if (!activeSymbols.has(sym)) {
        delete cache.stocks[sym];
      }
    }
    console.log(`Loaded ${Object.keys(cache.stocks).length} stocks from persistent cache file.`);
  } catch (e) {
    console.warn("Failed to load persistent cache file:", e.message);
  }
}

// Helper to make HTTPS requests and return Promise
function fetchHttps(urlStr) {
  return new Promise((resolve, reject) => {
    const options = url.parse(urlStr);
    options.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    };
    
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}. Status: ${res.statusCode}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Helper to make HTTPS requests and return raw text (no JSON parse)
function fetchHttpsRaw(urlStr) {
  return new Promise((resolve, reject) => {
    const options = url.parse(urlStr);
    options.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    };

    https.get(options, (res) => {
      // Follow redirects (3xx)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHttpsRaw(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// News cache: symbol -> { data, timestamp }
const newsCache = {};
const NEWS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Background Crawler Loop
// Crawls stocks one by one with a safe delay to prevent hitting rate limits
let crawlerIndex = 0;
async function crawlerLoop() {
  if (COMPANIES.length === 0) {
    setTimeout(crawlerLoop, 5000);
    return;
  }

  const comp = COMPANIES[crawlerIndex];
  crawlerIndex = (crawlerIndex + 1) % COMPANIES.length;

  try {
    const escapedSymbol = encodeURIComponent(comp.symbol);
    const urlStr = `https://query1.finance.yahoo.com/v8/finance/chart/${escapedSymbol}?range=1y&interval=1d`;
    
    const data = await fetchHttps(urlStr);
    if (data && data.chart && data.chart.result && data.chart.result.length > 0) {
      const result = data.chart.result[0];
      const meta = result.meta || {};
      const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
      const rawClosePrices = quote.close || [];
      const rawTimestamps = result.timestamp || [];

      // Align close prices and timestamps by discarding null indices
      const validHistory = [];
      for (let i = 0; i < rawTimestamps.length; i++) {
        const p = rawClosePrices[i];
        const t = rawTimestamps[i];
        if (p !== null && p !== undefined && t !== null && t !== undefined) {
          validHistory.push({ timestamp: t, price: p });
        }
      }

      const closePrices = validHistory.map(item => item.price);
      const timestamps = validHistory.map(item => item.timestamp);

      if (closePrices.length > 0) {
        const currentPrice = meta.regularMarketPrice || closePrices[closePrices.length - 1];
        
        let prevClose = null;
        const lastClose = closePrices[closePrices.length - 1];
        
        if (Math.abs(currentPrice - lastClose) > 0.001) {
          prevClose = lastClose;
        } else if (closePrices.length > 1) {
          prevClose = closePrices[closePrices.length - 2];
        } else {
          prevClose = currentPrice;
        }

        const dailyChange = currentPrice - prevClose;
        const dailyChangePct = prevClose ? (dailyChange / prevClose) * 100 : 0.0;

        let wowChange = 0.0;
        let wowChangePct = 0.0;
        if (closePrices.length >= 6) {
          const price5DaysAgo = closePrices[closePrices.length - 6];
          wowChange = currentPrice - price5DaysAgo;
          wowChangePct = (wowChange / price5DaysAgo) * 100;
        } else if (closePrices.length > 1) {
          const oldestPrice = closePrices[0];
          wowChange = currentPrice - oldestPrice;
          wowChangePct = (wowChange / oldestPrice) * 100;
        }

        const currency = meta.currency || 'USD';
        
        // 52-Week High & Low from full 1-year history
        const low_52 = Math.min(...closePrices);
        const high_52 = Math.max(...closePrices);

        // Compile history of last 30 trading days
        const historyData = [];
        const startIndex = Math.max(0, closePrices.length - 30);
        for (let i = startIndex; i < closePrices.length; i++) {
          const p = closePrices[i];
          const t = timestamps[i];
          if (p !== null && p !== undefined && t !== null && t !== undefined) {
            const dt = new Date(t * 1000);
            const dateStr = dt.getUTCFullYear() + '-' + 
                            String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                            String(dt.getUTCDate()).padStart(2, '0');
            historyData.push({ date: dateStr, price: Number(p.toFixed(2)) });
          }
        }

        cache.stocks[comp.symbol] = {
          symbol: comp.symbol,
          name: comp.name,
          category: comp.category,
          region: comp.region,
          price: Number(currentPrice.toFixed(2)),
          prev_close: Number(prevClose.toFixed(2)),
          daily_change: Number(dailyChange.toFixed(2)),
          daily_change_pct: Number(dailyChangePct.toFixed(2)),
          wow_change: Number(wowChange.toFixed(2)),
          wow_change_pct: Number(wowChangePct.toFixed(2)),
          high_52: Number(high_52.toFixed(2)),
          low_52: Number(low_52.toFixed(2)),
          currency: currency,
          sparkline: closePrices.slice(-7).map(p => Number(p.toFixed(2))),
          history: historyData
        };

        // Persist cache every 10 crawlings to decrease disk wear
        if (crawlerIndex % 10 === 0) {
          fs.writeFile(CACHE_FILE, JSON.stringify(cache.stocks, null, 2), () => {});
        }
      }
    }
  } catch (err) {
    console.error(`Crawler error on ${comp.symbol}:`, err.message);
  }

  // Crawl next stock after a safe delay of 750ms
  setTimeout(crawlerLoop, 750);
}

// Start crawler
crawlerLoop();

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (pathname === "/api/stocks") {
    // Return resolved list with latest prices (fill default 0s if not crawled yet)
    const list = COMPANIES.map(c => {
      const cached = cache.stocks[c.symbol];
      if (cached) {
        // Dynamic category and name alignment from resolved_companies.json ground truth
        return {
          ...cached,
          category: c.category,
          name: c.name
        };
      } else {
        return {
          symbol: c.symbol,
          name: c.name,
          category: c.category,
          region: c.region,
          price: 0.00,
          prev_close: 0.00,
          daily_change: 0.00,
          daily_change_pct: 0.00,
          wow_change: 0.00,
          wow_change_pct: 0.00,
          currency: 'USD',
          sparkline: []
        };
      }
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
  } 
  else if (pathname === "/api/unresolved") {
    // Return separate unresolved list (no dummy prices)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(UNRESOLVED_COMPANIES));
  }
  else if (pathname === "/api/history") {
    const symbol = parsedUrl.query.symbol;
    if (!symbol) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end("Missing symbol parameter");
      return;
    }

    try {
      const escapedSymbol = encodeURIComponent(symbol);
      const urlStr = `https://query1.finance.yahoo.com/v8/finance/chart/${escapedSymbol}?range=20y&interval=1d`;
      const data = await fetchHttps(urlStr);
      
      const historyResponse = { timestamps: [], prices: [] };
      if (data && data.chart && data.chart.result && data.chart.result.length > 0) {
        const result = data.chart.result[0];
        const timestamps = result.timestamp || [];
        const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
        const closePrices = quote.close || [];

        for (let i = 0; i < timestamps.length; i++) {
          const p = closePrices[i];
          const t = timestamps[i];
          if (p !== null && p !== undefined && t !== null && t !== undefined) {
            const dt = new Date(t * 1000);
            const dateStr = dt.getUTCFullYear() + '-' + 
                            String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                            String(dt.getUTCDate()).padStart(2, '0');
            historyResponse.timestamps.push(dateStr);
            historyResponse.prices.push(Number(p.toFixed(2)));
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(historyResponse));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end("Server Error fetching history: " + err.message);
    }
  }
  else if (pathname === "/api/news") {
    const symbol = parsedUrl.query.symbol;
    if (!symbol) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing symbol parameter' }));
      return;
    }

    // Check news cache
    const now = Date.now();
    if (newsCache[symbol] && (now - newsCache[symbol].timestamp) < NEWS_CACHE_TTL) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newsCache[symbol].data));
      return;
    }

    try {
      // Find company name for richer search
      const comp = COMPANIES.find(c => c.symbol === symbol);
      const companyName = comp ? encodeURIComponent(comp.name) : encodeURIComponent(symbol);
      const rssUrl = `https://news.google.com/rss/search?q=${companyName}+shipping+stock&hl=en-US&gl=US&ceid=US:en`;
      const rssXml = await fetchHttpsRaw(rssUrl);

      // Parse RSS XML with regex
      const items = [];
      const itemRegex = /<item>(.*?)<\/item>/gs;
      let match;
      while ((match = itemRegex.exec(rssXml)) !== null && items.length < 8) {
        const itemXml = match[1];
        const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>(.*?)<\/link>/) || itemXml.match(/<link\/>(\S+)/);
        const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
        const sourceMatch = itemXml.match(/<source[^>]*>(.*?)<\/source>/) || itemXml.match(/<source[^>]*><!\[CDATA\[(.*?)\]\]><\/source>/);
        const descMatch = itemXml.match(/<description>(.*?)<\/description>/gs) || itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/gs);

        let title = titleMatch ? titleMatch[1].trim() : 'No title';
        title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        title = title.replace(/^<!\[CDATA\[(.*?)\]\]>$/g, '$1');

        let description = '';
        if (descMatch) {
          description = descMatch[0].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
          description = description.replace(/^<!\[CDATA\[(.*?)\]\]>$/g, '$1');
          if (description.length > 180) {
            description = description.substring(0, 177) + '...';
          }
        }

        items.push({
          title: title,
          link: linkMatch ? linkMatch[1].trim() : '',
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
          source: sourceMatch ? sourceMatch[1].replace(/<[^>]*>/g, '').trim() : 'Unknown',
          description: description || title // fallback to title if empty
        });
      }

      // Cache the result
      newsCache[symbol] = { data: items, timestamp: now };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(items));
    } catch (err) {
      console.error(`News fetch error for ${symbol}:`, err.message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
    }
  }
  else {
    let filePath = path.join(DIRECTORY, pathname === '/' ? 'index.html' : pathname);
    
    if (!filePath.startsWith(DIRECTORY)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end("Forbidden");
      return;
    }

    fs.exists(filePath, (exists) => {
      if (!exists) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end("File Not Found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  }
});

server.listen(PORT, () => {
  console.log(`Starting Maritime Stock Terminal server at http://localhost:${PORT}`);
});
