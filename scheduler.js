import { GearHunterDB } from './database.js';
import * as cheerio from 'cheerio';

class GearHunterScheduler {
  constructor() {
    this.interval = 5; // Default 5 minutes
    this.isActive = false;
    this.isRunning = false;
    this.timeoutId = null;
    this.lastRun = null;
    this.nextRun = null;
    this.dailyFullScrapeTimeoutId = null;
    this.lastFullScrape = null;
  }

  start(intervalMinutes = this.interval) {
    this.stop(); // Stop any existing schedule
    this.interval = intervalMinutes;
    this.isActive = true;
    this.scheduleNext();
    this.scheduleDailyFullScrape(); // Start daily full scrape schedule
    console.log(`Scheduler started: updating every ${this.interval} minutes`);
  }

  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.dailyFullScrapeTimeoutId) {
      clearTimeout(this.dailyFullScrapeTimeoutId);
      this.dailyFullScrapeTimeoutId = null;
    }
    this.isActive = false;
    this.nextRun = null;
    console.log('Scheduler stopped');
  }

  scheduleDailyFullScrape() {
    // Calculate next 2:00 AM
    const now = new Date();
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0);

    // If it's already past 2 AM today, schedule for tomorrow
    if (now >= next2AM) {
      next2AM.setDate(next2AM.getDate() + 1);
    }

    const msUntil2AM = next2AM - now;

    console.log(`Daily full scrape scheduled for: ${next2AM.toLocaleString()}`);

    this.dailyFullScrapeTimeoutId = setTimeout(async () => {
      await this.runFullScrape();
      // Schedule next day's full scrape (24 hours from now)
      this.scheduleDailyFullScrape();
    }, msUntil2AM);
  }

  async runFullScrape() {
    if (this.isRunning) {
      console.log('Partial scrape already running, skipping full scrape');
      return { newProducts: 0, updatedProducts: 0, markedUnavailable: 0, skipped: true };
    }

    this.isRunning = true;
    this.lastFullScrape = new Date();

    try {
      console.log('Starting daily full scrape...');
      // Full scrape - no page limit
      const products = await this.scrapeGearHunterDetailed();

      const db = new GearHunterDB();
      await db.init();

      // Mark products not in results as unavailable (true for full scrape)
      const { newProducts, updatedProducts, markedUnavailable } = await db.addProducts(products, true);
      await db.close();

      console.log(`Daily full scrape completed: ${newProducts} new, ${updatedProducts} updated, ${markedUnavailable} marked unavailable`);

      return { newProducts, updatedProducts, markedUnavailable };
    } catch (error) {
      console.error('Daily full scrape failed:', error);
      return { newProducts: 0, updatedProducts: 0, markedUnavailable: 0, error: error.message };
    } finally {
      this.isRunning = false;
    }
  }

  scheduleNext() {
    if (!this.isActive) return;

    const nextRunTime = new Date(Date.now() + this.interval * 60 * 1000);
    this.nextRun = nextRunTime;

    this.timeoutId = setTimeout(async () => {
      await this.runScrape();
      this.scheduleNext(); // Schedule the next run
    }, this.interval * 60 * 1000);
  }

  async runScrape() {
    if (this.isRunning) {
      console.log('Scraper already running, skipping this cycle');
      return { newProducts: 0, updatedProducts: 0, skipped: true };
    }

    this.isRunning = true;
    this.lastRun = new Date();
    
    try {
      console.log('Starting scheduled scrape...');

      const db = new GearHunterDB();
      await db.init();

      // For scheduled scrapes, use smart early stopping
      // Stop when we see mostly duplicates (products already in DB)
      const products = await this.scrapeUntilDuplicates(db, 10);

      // Don't mark missing as unavailable for partial scrapes
      const { newProducts, updatedProducts, markedUnavailable } = await db.addProducts(products, false);
      await db.close();

      console.log(`Scheduled scrape completed: ${newProducts} new, ${updatedProducts} updated`);

      return { newProducts, updatedProducts, markedUnavailable };
    } catch (error) {
      console.error('Scheduled scrape failed:', error);
      return { newProducts: 0, updatedProducts: 0, markedUnavailable: 0, error: error.message };
    } finally {
      this.isRunning = false;
    }
  }

  async scrapeUntilDuplicates(db, maxPages = 10) {
    const baseUrl = 'https://www.long-mcquade.com/GearHunter/';
    const allProducts = [];
    let page = 1;
    let consecutiveDuplicatePages = 0;

    console.log('Smart scraping with early stopping enabled');

    while (page <= maxPages) {
      try {
        const url = page === 1 ? baseUrl : `${baseUrl}?Current=${(page-1)*32}`;

        const response = await fetch(url);
        if (!response.ok) break;

        const html = await response.text();
        const $ = cheerio.load(html);

        const productContainers = $('a[href*="/GearHunter/"][href$=".htm"]').parent();

        let productsOnThisPage = 0;
        let duplicatesOnThisPage = 0;

        for (const element of productContainers.toArray()) {
          const $container = $(element);
          const $link = $container.find('a[href*="/GearHunter/"]').first();

          const product = {
            id: null,
            title: null,
            url: null,
            image: null,
            salePrice: null,
            regularPrice: null,
            price: null,
            location: null,
            phone: null,
            monthly: null
          };

          const href = $link.attr('href');
          if (href) {
            product.url = href.startsWith('http') ? href : `https://www.long-mcquade.com${href}`;
            const idMatch = href.match(/\/(\d+)\//);
            product.id = idMatch ? idMatch[1] : null;
          }

          const $img = $link.find('img');
          product.image = $img.attr('src');
          product.title = $img.attr('alt') || $link.text().trim();

          const text = $container.text();

          const salePriceMatch = text.match(/Sale Price:\s*\$?([\d,]+\.?\d*)/);
          const regularPriceMatch = text.match(/Regular Price:\s*\$?([\d,]+\.?\d*)/);
          const priceMatch = text.match(/(?<!Regular\s)(?<!Sale\s)Price:\s*\$?([\d,]+\.?\d*)/);
          const monthlyMatch = text.match(/from:\s*\$?([\d,]+\.?\d*)\/mo/);

          product.salePrice = salePriceMatch ? parseFloat(salePriceMatch[1].replace(',', '')) : null;
          product.regularPrice = regularPriceMatch ? parseFloat(regularPriceMatch[1].replace(',', '')) : null;
          product.price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;
          product.monthly = monthlyMatch ? parseFloat(monthlyMatch[1].replace(',', '')) : null;

          const locationMatch = text.match(/([A-Za-z\s]+,\s*[A-Za-z\s]+)\s*\(?([\d-]{3,})\)?/);
          if (locationMatch) {
            product.location = locationMatch[1].trim();
            product.phone = locationMatch[2].replace(/\D/g, '');
          }

          if (product.title && product.url && product.id && !product.url.includes('/departments/')) {
            allProducts.push(product);
            productsOnThisPage++;

            // Check if this product already exists in DB
            const exists = await db.productExists(product.id);
            if (exists) {
              duplicatesOnThisPage++;
            }
          }
        }

        const duplicateRatio = productsOnThisPage > 0 ? duplicatesOnThisPage / productsOnThisPage : 0;
        console.log(`Page ${page}: ${productsOnThisPage} products, ${duplicatesOnThisPage} duplicates (${Math.round(duplicateRatio * 100)}%)`);

        // Stop early if we see 90%+ duplicates on this page
        if (duplicateRatio >= 0.9 && productsOnThisPage > 10) {
          consecutiveDuplicatePages++;
          if (consecutiveDuplicatePages >= 2) {
            console.log('Stopping early: 2 consecutive pages with 90%+ duplicates');
            break;
          }
        } else {
          consecutiveDuplicatePages = 0;
        }

        page++;
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error scraping page ${page}:`, error.message);
        break;
      }
    }

    console.log(`Smart scrape complete: ${allProducts.length} products from ${page - 1} pages`);
    return allProducts;
  }

  async scrapeGearHunterDetailed(maxPages = null) {
    const baseUrl = 'https://www.long-mcquade.com/GearHunter/';
    const allProducts = [];
    const seenIds = new Set();
    let page = 1;
    let consecutiveEmptyPages = 0;
    let consecutiveLowPages = 0;

    console.log('Starting full scrape (no page limit)...');

    while (true) {
      // Stop if we've hit the max pages limit (if specified)
      if (maxPages && page > maxPages) {
        console.log(`Reached max pages limit: ${maxPages}`);
        break;
      }

      try {
        const url = page === 1 ? baseUrl : `${baseUrl}?Current=${(page-1)*32}`;
        console.log(`Scraping page ${page}...`);

        const response = await fetch(url);

        if (!response.ok) {
          break;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Find product containers
        const productContainers = $('a[href*="/GearHunter/"][href$=".htm"]').parent();

        let productsOnThisPage = 0;

        productContainers.each((index, element) => {
          const $container = $(element);
          const $link = $container.find('a[href*="/GearHunter/"]').first();

          const product = {
            id: null,
            title: null,
            url: null,
            image: null,
            salePrice: null,
            regularPrice: null,
            price: null,
            location: null,
            phone: null,
            monthly: null
          };

          // Extract URL and ID
          const href = $link.attr('href');
          if (href) {
            product.url = href.startsWith('http') ? href : `https://www.long-mcquade.com${href}`;
            const idMatch = href.match(/\/(\d+)\//);
            product.id = idMatch ? idMatch[1] : null;
          }

          // Extract image and title
          const $img = $link.find('img');
          product.image = $img.attr('src');
          product.title = $img.attr('alt') || $link.text().trim();

          // Extract all text content
          const text = $container.text();

          // Extract prices
          const salePriceMatch = text.match(/Sale Price:\s*\$?([\d,]+\.?\d*)/);
          const regularPriceMatch = text.match(/Regular Price:\s*\$?([\d,]+\.?\d*)/);
          const priceMatch = text.match(/(?<!Regular\s)(?<!Sale\s)Price:\s*\$?([\d,]+\.?\d*)/);
          const monthlyMatch = text.match(/from:\s*\$?([\d,]+\.?\d*)\/mo/);

          product.salePrice = salePriceMatch ? parseFloat(salePriceMatch[1].replace(',', '')) : null;
          product.regularPrice = regularPriceMatch ? parseFloat(regularPriceMatch[1].replace(',', '')) : null;
          product.price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;
          product.monthly = monthlyMatch ? parseFloat(monthlyMatch[1].replace(',', '')) : null;

          // Extract location and phone
          const locationMatch = text.match(/([A-Za-z\s]+,\s*[A-Za-z\s]+)\s*\(?([\d-]{3,})\)?/);
          if (locationMatch) {
            product.location = locationMatch[1].trim();
            product.phone = locationMatch[2].replace(/\D/g, '');
          }

          // Only add if we have essential data and haven't seen this ID
          if (product.title && product.url && product.id && !product.url.includes('/departments/')) {
            if (!seenIds.has(product.id)) {
              allProducts.push(product);
              seenIds.add(product.id);
            }
            productsOnThisPage++;
          }
        });

        const newProductsOnPage = allProducts.length - (allProducts.length - seenIds.size + productsOnThisPage);
        console.log(`Page ${page}: found ${productsOnThisPage} products (${newProductsOnPage} new, total: ${allProducts.length})`);

        // Stop if we found no products on this page
        if (productsOnThisPage === 0) {
          consecutiveEmptyPages++;
          console.log(`Empty page (${consecutiveEmptyPages}/2)`);
          if (consecutiveEmptyPages >= 2) {
            console.log('Stopping: 2 consecutive empty pages');
            break;
          }
        } else {
          consecutiveEmptyPages = 0;
        }

        // Stop if we're only finding 1-2 products per page for 3 consecutive pages (likely pagination past end)
        if (productsOnThisPage <= 2) {
          consecutiveLowPages++;
          if (consecutiveLowPages >= 3) {
            console.log('Stopping: 3 consecutive pages with ≤2 products (pagination past end)');
            break;
          }
        } else {
          consecutiveLowPages = 0;
        }

        page++;

        // Wait between requests
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error scraping page ${page}:`, error.message);
        break;
      }
    }

    console.log(`Full scrape complete: ${allProducts.length} products from ${page - 1} pages`);
    return allProducts;
  }

  getStatus() {
    return {
      active: this.isActive,
      running: this.isRunning,
      interval: this.interval,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      lastFullScrape: this.lastFullScrape,
      nextFullScrape: this.dailyFullScrapeTimeoutId ? this.getNextFullScrapeTime() : null
    };
  }

  getNextFullScrapeTime() {
    const now = new Date();
    const next2AM = new Date();
    next2AM.setHours(2, 0, 0, 0);

    if (now >= next2AM) {
      next2AM.setDate(next2AM.getDate() + 1);
    }

    return next2AM;
  }
}

export const scheduler = new GearHunterScheduler();