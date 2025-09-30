# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GearHunter is a real-time web scraper and notification system for Long & McQuade's GearHunter deals page. It consists of a web scraper, SQLite database, HTTP server, and web interface with automatic scheduling.

## Working with Github
- Every time code is committed and uploaded to Github, it should assigned to an issue that already exists and in a branch named after that issue
- If an issue doesn't exist yet, make it and a new branch before uploading
- After every commit and publish, create a PR against the issue, and merge the PR

## Commands

### Development
- `npm start` - Start the web server (default port 3000) with automatic 5-minute scraping schedule
- `npm run scrape` - Run the scraper once to populate/update the database
- `npm run validate` - (Optional) Manually check individual product pages for availability

### Workflow
1. First run: `npm run scrape` to do a full scrape (all pages, ~4000+ products)
2. Start server: `npm start`
3. Access web interface at `http://localhost:3000`
4. **Manual scraping** (`npm run scrape`): Full scrape, marks missing products as unavailable
5. **Automatic scheduled scraping**: Partial scrape (first 10 pages only), updates/adds products without marking old ones unavailable

## Architecture

### Core Components

**Scraper (`scraper.js`)**
- Scrapes ALL pages from Long & McQuade's GearHunter (~4000+ products across 125+ pages)
- Stops automatically when 2 consecutive empty pages are found
- Uses Cheerio to parse HTML and extract product data
- Extracts product IDs from URLs using regex `/(\d+)/`
- Parses prices (sale, regular, monthly), location, and phone from text patterns
- Rate-limited to 1 second between page requests (~3+ minutes for full scrape)
- Creates JSON backup files in `search-results/` directory
- **Full scrape**: Marks products not in results as unavailable (run manually via `npm run scrape`)

**Database (`database.js`)**
- SQLite wrapper class (`GearHunterDB`)
- Products table uses product ID as primary key for duplicate prevention
- `INSERT OR REPLACE` pattern updates existing products
- Maps between snake_case DB columns and camelCase JS properties
- `available` column (INTEGER: 1=available, 0=sold) filters out sold products
- `getAllProducts()` only returns available products by default (pass `true` to include all)
- `addProducts()` automatically marks products as unavailable if they're not in current scrape results
- Returns `{ newProducts, updatedProducts, markedUnavailable }`

**Validator (`validator.js`)** - Optional
- Alternative validation method that fetches individual product pages
- Detects "sold" status by searching for "This item has been sold", "SOLD", or 404 errors
- Not required since `addProducts()` handles availability automatically

**Scheduler (`scheduler.js`)**
- Singleton instance managing automatic scrape intervals
- Prevents concurrent scrapes with `isRunning` flag
- Tracks `lastRun` and `nextRun` timestamps
- Contains duplicate scraping logic (same as `scraper.js`)
- **Smart partial scrape**: Uses early stopping when 90%+ products are duplicates
- Stops after 2 consecutive pages with 90%+ duplicates (max 10 pages)
- Typically scrapes 1-3 pages if DB is up to date, ~2-4 seconds
- Does NOT mark missing products as unavailable (avoids false positives)
- Product IDs are sequential, so newest products appear on first pages
- Can be controlled via API endpoints

**Server (`server.js`)**
- Vanilla Node.js HTTP server (no Express)
- Serves static `index.html` at root
- API endpoints:
  - `GET /api/products` - All products from database
  - `GET /api/stats` - Computed statistics (total, avg savings, best deal)
  - `GET /api/schedule` - Current scheduler status
  - `POST /api/schedule` - Update interval (JSON: `{"interval": minutes}`)
  - `POST /api/scrape` - Trigger immediate scrape
- Auto-starts 5-minute schedule on server launch

**Web Interface (`index.html`)**
- Single-file HTML with embedded CSS and JavaScript
- Real-time search and filtering
- Displays product cards with images, prices, locations
- Statistics dashboard
- Scheduler controls for manual updates and interval adjustment

### Data Flow

1. Scraper fetches HTML → parses with Cheerio → extracts product objects
2. Database checks product ID → INSERT (new) or REPLACE (existing)
3. Server queries database → serves via API
4. Web interface polls API → renders product cards
5. Scheduler triggers automatic scrapes at configured intervals

### Key Implementation Details

- Uses ES modules (`"type": "module"` in package.json)
- Product ID extracted from URL is critical for deduplication
- Scraping logic is duplicated in both `scraper.js` and `scheduler.js`
- No test suite exists (`"test": "test"` is placeholder)
- JSON backups created even though database is primary storage
- Database connection opened/closed for each API request (no connection pooling)