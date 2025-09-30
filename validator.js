// Validates product availability by checking for "Sold" status
// Run with: node validator.js

import { GearHunterDB } from './database.js';

async function checkProductAvailability(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();

    // Check for various "sold" indicators
    const isSold =
      html.includes('This item has been sold') ||
      html.includes('SOLD') ||
      html.includes('No longer available') ||
      response.status === 404;

    return !isSold;
  } catch (error) {
    console.error(`Error checking ${url}:`, error.message);
    return true; // Assume available if check fails
  }
}

async function validateAllProducts() {
  const db = new GearHunterDB();

  try {
    await db.init();
    console.log('Database initialized\n');

    // Get all products (including unavailable ones for revalidation)
    const products = await db.getAllProducts(true);
    console.log(`Validating ${products.length} products...\n`);

    let checkedCount = 0;
    let unavailableCount = 0;
    let availableCount = 0;

    for (const product of products) {
      checkedCount++;

      if (checkedCount % 10 === 0) {
        console.log(`Progress: ${checkedCount}/${products.length}`);
      }

      const isAvailable = await checkProductAvailability(product.url);

      if (!isAvailable && product.available) {
        // Product became unavailable
        await db.markProductUnavailable(product.id);
        console.log(`❌ Marked as SOLD: ${product.title} (${product.id})`);
        unavailableCount++;
      } else if (isAvailable && !product.available) {
        // Product became available again
        await db.markProductAvailable(product.id);
        console.log(`✅ Marked as AVAILABLE: ${product.title} (${product.id})`);
        availableCount++;
      }

      // Rate limit: wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n--- Validation Complete ---');
    console.log(`Total products checked: ${checkedCount}`);
    console.log(`Marked as sold: ${unavailableCount}`);
    console.log(`Marked as available: ${availableCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

// Run validation
validateAllProducts();