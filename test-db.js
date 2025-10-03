#!/usr/bin/env node
import { GearHunterDB } from './database.js';

async function testDatabase() {
  console.log('Testing PostgreSQL database connection...');
  
  const db = new GearHunterDB();
  
  try {
    await db.init();
    console.log('✅ Database connection successful');
    
    // Test table creation
    console.log('✅ Tables created/verified');
    
    // Test basic operations
    const count = await db.getProductsCount();
    console.log(`✅ Current product count: ${count}`);
    
    const products = await db.getAllProducts();
    console.log(`✅ Retrieved ${products.length} products`);
    
    await db.close();
    console.log('✅ Database connection closed');
    
    console.log('\n🎉 PostgreSQL database test completed successfully!');
  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  }
}

testDatabase();