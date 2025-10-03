#!/usr/bin/env node

// GearHunted Scraper Job - runs once and exits
// This is triggered by Cloud Scheduler instead of running continuously

import { scrape } from './scraper.js';

async function runScraperJob() {
  console.log('Starting GearHunted scraper job at', new Date().toISOString());
  
  try {
    const isFullScrape = process.env.FULL_SCRAPE === 'true';
    console.log('Scrape type:', isFullScrape ? 'FULL' : 'PARTIAL');
    
    await scrape(isFullScrape);
    console.log('✅ Scraper job completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Scraper job failed:', error);
    process.exit(1);
  }
}

runScraperJob();