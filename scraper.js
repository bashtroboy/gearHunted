// Long & McQuade GearHunter Scraper
// Run with: node scraper.js

// Note: Install cheerio first with: npm install cheerio

import * as cheerio from 'cheerio';
import { GearHunterDB } from './database.js';

async function scrapeGearHunter(maxPages = 5) {
  const baseUrl = 'https://www.long-mcquade.com/GearHunter/';
  const allProducts = [];
  
  console.log('Starting to scrape GearHunter...\n');
  
  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = page === 1 ? baseUrl : `${baseUrl}?Current=${(page-1)*32}`;
      console.log(`Fetching page ${page}: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`Page ${page} not found or error. Stopping.`);
        break;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Find all product links and extract data
      const products = [];
      $('a[href*="/GearHunter/"]').each((index, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        
        // Skip if it's the main GearHunter link itself
        if (!href || href === '/GearHunter/' || href.endsWith('/GearHunter/')) {
          return;
        }
        
        // Extract product information from the link and its contents
        const $img = $link.find('img');
        const title = $link.text().trim() || $img.attr('alt') || '';
        
        // Look for price and location info in nearby elements
        const $parent = $link.parent();
        const text = $parent.text();
        
        // Extract sale price, regular price, and location
        const salePriceMatch = text.match(/Sale Price:\s*\$?([\d,]+\.?\d*)/);
        const regularPriceMatch = text.match(/Regular Price:\s*\$?([\d,]+\.?\d*)/);
        const priceMatch = text.match(/Price:\s*\$?([\d,]+\.?\d*)/);
        
        // Location is usually followed by a phone number
        const locationMatch = text.match(/([A-Za-z\s]+,\s*[A-Za-z\s]+)\s*\(?\d{3}\)?/);
        
        const product = {
          title: title,
          url: href.startsWith('http') ? href : `https://www.long-mcquade.com${href}`,
          image: $img.attr('src') || null,
          salePrice: salePriceMatch ? salePriceMatch[1] : null,
          regularPrice: regularPriceMatch ? regularPriceMatch[1] : null,
          price: priceMatch ? priceMatch[1] : null,
          location: locationMatch ? locationMatch[1].trim() : null
        };
        
        // Only add products with valid titles and URLs
        if (product.title && product.url.includes('/GearHunter/') && product.url.includes('.htm')) {
          products.push(product);
        }
      });
      
      // Remove duplicates based on URL
      const uniqueProducts = products.filter((product, index, self) =>
        index === self.findIndex((p) => p.url === product.url)
      );
      
      console.log(`Found ${uniqueProducts.length} products on page ${page}`);
      
      if (uniqueProducts.length === 0) {
        console.log('No more products found. Stopping.');
        break;
      }
      
      allProducts.push(...uniqueProducts);
      
      // Be nice to the server - wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error scraping page ${page}:`, error.message);
      break;
    }
  }
  
  console.log(`\n✓ Total products scraped: ${allProducts.length}`);
  return allProducts;
}

// Alternative: More robust scraping function that parses the structure better
async function scrapeGearHunterDetailed(maxPages = null) {
  const baseUrl = 'https://www.long-mcquade.com/GearHunter/';
  const allProducts = [];
  let page = 1;
  let consecutiveEmptyPages = 0;

  console.log('Starting detailed scrape of GearHunter...\n');
  console.log(maxPages ? `Scraping up to ${maxPages} pages` : 'Scraping all available pages');

  while (true) {
    // Stop if we've hit the max pages limit (if specified)
    if (maxPages && page > maxPages) {
      console.log(`Reached max pages limit (${maxPages}). Stopping.`);
      break;
    }

    try {
      const url = page === 1 ? baseUrl : `${baseUrl}?Current=${(page-1)*32}`;
      console.log(`Fetching page ${page}: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        console.log(`Page ${page} not found. Stopping.`);
        break;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Find product containers - adjust selector based on actual HTML structure
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

        // Only add if we have essential data and it's not a category page
        if (product.title && product.url && !product.url.includes('/departments/')) {
          allProducts.push(product);
          productsOnThisPage++;
        }
      });

      console.log(`Page ${page} complete. Found ${productsOnThisPage} products. Total so far: ${allProducts.length}`);

      // Stop if we found no products on this page
      if (productsOnThisPage === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 2) {
          console.log('No products found on last 2 pages. Stopping.');
          break;
        }
      } else {
        consecutiveEmptyPages = 0;
      }

      page++;
      
      // Wait between requests
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`Error scraping page ${page}:`, error.message);
      break;
    }
  }

  console.log(`\n✓ Total products scraped: ${allProducts.length}`);
  return allProducts;
}

// Main execution
async function main() {
  const db = new GearHunterDB();
  
  try {
    // Initialize database
    await db.init();
    console.log('Database initialized successfully\n');
    
    // Get current product count
    const initialCount = await db.getProductsCount();
    console.log(`Current products in database: ${initialCount}\n`);

    // Scrape all pages (pass null for unlimited, or a number to limit)
    const products = await scrapeGearHunterDetailed();
    
    // Add products to database (only new ones will be added)
    console.log('\n--- Adding products to database ---');
    const { newProducts, updatedProducts, markedUnavailable } = await db.addProducts(products);

    console.log(`✓ New products added: ${newProducts}`);
    console.log(`✓ Products updated: ${updatedProducts}`);
    console.log(`✓ Products marked unavailable: ${markedUnavailable}`);

    const finalCount = await db.getProductsCount();
    console.log(`✓ Total available products in database: ${finalCount}`);
    
    // Still save to JSON file for backup
    const fs = await import('fs');
    const dirname = 'search-results';
    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }
    const filename = `${dirname}/gearhunter-products-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(products, null, 2));
    console.log(`✓ Backup saved to ${filename}`);
    
    // Display sample of new products
    if (newProducts > 0) {
      console.log('\n--- Sample New Products ---');
      const newOnes = products.slice(0, Math.min(3, newProducts));
      newOnes.forEach(product => {
        console.log(`\nTitle: ${product.title}`);
        console.log(`ID: ${product.id}`);
        console.log(`Price: $${product.salePrice || product.price || 'N/A'}`);
        console.log(`Location: ${product.location || 'N/A'}`);
        console.log(`URL: ${product.url}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

// Run the scraper
main();