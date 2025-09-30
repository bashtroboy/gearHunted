# GearHunter - Database Edition

A real-time scraper and web interface for Long & McQuade's GearHunter deals, now with SQLite database storage to avoid duplicate entries.

## Features

- **SQLite Database Storage**: Products are stored in a local SQLite database
- **Duplicate Prevention**: Uses unique product IDs to avoid adding duplicate items
- **Auto-Scheduling**: Automatic scraping at configurable intervals (default: 5 minutes)
- **Modern Web Interface**: Clean, responsive web page to browse deals with scheduler controls
- **Real-time API**: RESTful API endpoints for products, statistics, and scheduling
- **Manual Updates**: "Update Now" button for immediate scraping
- **Automatic Backups**: JSON backups are still created for each scrape run

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the scraper** (populates database):
   ```bash
   npm run scrape
   ```

3. **Start the web server**:
   ```bash
   npm start
   ```

4. **View deals**: Open http://localhost:3000 in your browser

## Database Schema

The SQLite database (`gearhunter.db`) contains a `products` table with:

- `id` (TEXT PRIMARY KEY) - Unique product identifier from L&M
- `title` (TEXT) - Product name
- `url` (TEXT) - Product URL
- `image` (TEXT) - Product image URL
- `sale_price` (REAL) - Sale price
- `regular_price` (REAL) - Regular price
- `price` (REAL) - General price (if no sale/regular distinction)
- `location` (TEXT) - Store location
- `phone` (TEXT) - Store phone number
- `monthly` (REAL) - Monthly payment option
- `created_at` (DATETIME) - When first added
- `updated_at` (DATETIME) - When last updated

## API Endpoints

- `GET /api/products` - Returns all products from database
- `GET /api/stats` - Returns statistics (total items, avg savings, best deal)
- `GET /api/schedule` - Returns current schedule status and settings
- `POST /api/schedule` - Update schedule interval (JSON: `{"interval": minutes}`)
- `POST /api/scrape` - Run scraper immediately

## How It Works

1. **Scraper** (`scraper.js`):
   - Scrapes Long & McQuade's GearHunter pages
   - Extracts product data including unique IDs
   - Checks database for existing products using ID
   - Only adds new products or updates existing ones
   - Creates JSON backup files

2. **Database** (`database.js`):
   - SQLite database wrapper class
   - Handles product storage and retrieval
   - Prevents duplicates using product ID as primary key

3. **Web Server** (`server.js`):
   - Serves the web interface
   - Provides API endpoints for products and stats
   - Reads from database instead of JSON files

4. **Web Interface** (`index.html`):
   - Modern, responsive design
   - Real-time search and filtering
   - Product cards with images, prices, and locations
   - Statistics dashboard

## Files Created

- `gearhunter.db` - SQLite database
- `search-results/gearhunter-products-[timestamp].json` - Backup files

## Running Multiple Times

When you run the scraper multiple times:
- New products are added to the database
- Existing products (same ID) are updated with latest info
- The scraper reports how many new vs updated products were processed
- Web interface always shows the complete, up-to-date inventory