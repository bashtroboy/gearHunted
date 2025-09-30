import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GearHunterDB } from './database.js';
import { scheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function getMimeType(filePath) {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function serveStaticFile(filePath, res) {
  try {
    const content = readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
  }
}

// Helper function to parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    // API routes
    if (url.pathname === '/api/products') {
      const db = new GearHunterDB();
      await db.init();

      const includeUnavailable = url.searchParams.get('includeUnavailable') === 'true';
      const products = await db.getAllProducts(includeUnavailable);
      await db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(products));
      return;
    }
    
    if (url.pathname === '/api/products/new') {
      const since = url.searchParams.get('since');
      if (!since) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "since" parameter' }));
        return;
      }

      const db = new GearHunterDB();
      await db.init();

      const sinceTimestamp = parseInt(since);
      const products = await db.getProductsSince(sinceTimestamp);
      await db.close();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(products));
      return;
    }

    if (url.pathname === '/api/stats') {
      const db = new GearHunterDB();
      await db.init();

      const products = await db.getAllProducts();
      await db.close();
      
      const validProducts = products.filter(p => p.salePrice && p.regularPrice);
      const totalItems = validProducts.length;
      
      const avgSavings = totalItems > 0 ? Math.round(
        validProducts.reduce((sum, product) => {
          const savings = ((product.regularPrice - product.salePrice) / product.regularPrice) * 100;
          return sum + savings;
        }, 0) / totalItems
      ) : 0;
      
      const bestDealProduct = validProducts.reduce((best, current) => {
        const currentSavings = current.regularPrice - current.salePrice;
        const bestSavings = best ? best.regularPrice - best.salePrice : 0;
        return currentSavings > bestSavings ? current : best;
      }, null);
      
      const bestDeal = bestDealProduct ? bestDealProduct.regularPrice - bestDealProduct.salePrice : 0;
      
      const stats = {
        totalItems,
        avgSavings,
        bestDeal
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }

    // Schedule management endpoints
    if (url.pathname === '/api/schedule') {
      if (req.method === 'GET') {
        const status = scheduler.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
        return;
      }
      
      if (req.method === 'POST') {
        const body = await parseBody(req);
        const interval = parseInt(body.interval);
        
        if (interval && interval >= 1 && interval <= 1440) {
          scheduler.start(interval);
          const status = scheduler.getStatus();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(status));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid interval. Must be between 1 and 1440 minutes.' }));
        }
        return;
      }
    }

    // Manual scrape endpoint
    if (url.pathname === '/api/scrape' && req.method === 'POST') {
      const result = await scheduler.runScrape();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    // Manual full scrape endpoint
    if (url.pathname === '/api/scrape/full' && req.method === 'POST') {
      const result = await scheduler.runFullScrape();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }
    
    // Static file serving
    let filePath;
    if (url.pathname === '/') {
      filePath = join(__dirname, 'index.html');
    } else {
      filePath = join(__dirname, url.pathname);
    }
    
    serveStaticFile(filePath, res);
    
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('API endpoints:');
  console.log(`  GET http://localhost:${PORT}/api/products - Get all products`);
  console.log(`  GET http://localhost:${PORT}/api/stats - Get statistics`);
  console.log(`  GET http://localhost:${PORT}/api/schedule - Get schedule status`);
  console.log(`  POST http://localhost:${PORT}/api/schedule - Set schedule interval`);
  console.log(`  POST http://localhost:${PORT}/api/scrape - Run scraper now`);
  
  // Start default 5-minute schedule
  scheduler.start(5);
  console.log('\nScheduler started with 5-minute interval');
});