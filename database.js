import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'gearhunter.db');

export class GearHunterDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('Connected to SQLite database');
        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  async createTables() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        title TEXT,
        url TEXT,
        image TEXT,
        sale_price REAL,
        regular_price REAL,
        price REAL,
        location TEXT,
        phone TEXT,
        monthly REAL,
        available INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.run(createTableSQL, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('Products table created or verified');

        // Add available column if it doesn't exist (for existing databases)
        this.db.run('ALTER TABLE products ADD COLUMN available INTEGER DEFAULT 1', (alterErr) => {
          // Ignore error if column already exists
          resolve();
        });
      });
    });
  }

  async productExists(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id FROM products WHERE id = ?', [id], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(!!row);
      });
    });
  }

  async addProduct(product) {
    const insertSQL = `
      INSERT OR REPLACE INTO products (
        id, title, url, image, sale_price, regular_price, 
        price, location, phone, monthly, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(insertSQL, [
        product.id,
        product.title,
        product.url,
        product.image,
        product.salePrice,
        product.regularPrice,
        product.price,
        product.location,
        product.phone,
        product.monthly
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes);
      });
    });
  }

  async addProducts(products, markMissingAsUnavailable = true) {
    let newProducts = 0;
    let updatedProducts = 0;
    let markedUnavailable = 0;

    // Get IDs of products in the current scrape
    const scrapedIds = products.filter(p => p.id).map(p => p.id);

    // Mark products as unavailable if they're no longer in scraping results
    // Only do this if markMissingAsUnavailable is true (should only be true for full scrapes)
    if (markMissingAsUnavailable && scrapedIds.length > 0) {
      const placeholders = scrapedIds.map(() => '?').join(',');
      const markUnavailableSQL = `
        UPDATE products
        SET available = 0, updated_at = CURRENT_TIMESTAMP
        WHERE available = 1 AND id NOT IN (${placeholders})
      `;

      try {
        const changes = await new Promise((resolve, reject) => {
          this.db.run(markUnavailableSQL, scrapedIds, function(err) {
            if (err) {
              reject(err);
              return;
            }
            resolve(this.changes);
          });
        });
        markedUnavailable = changes;
        if (markedUnavailable > 0) {
          console.log(`Marked ${markedUnavailable} product(s) as unavailable (no longer in scrape results)`);
        }
      } catch (error) {
        console.error('Error marking unavailable products:', error);
      }
    }

    // Add or update products from scrape
    for (const product of products) {
      if (!product.id) continue;

      try {
        const exists = await this.productExists(product.id);
        await this.addProduct(product);

        if (exists) {
          updatedProducts++;
        } else {
          newProducts++;
        }
      } catch (error) {
        console.error(`Error adding product ${product.id}:`, error);
      }
    }

    return { newProducts, updatedProducts, markedUnavailable };
  }

  async getAllProducts(includeUnavailable = false) {
    return new Promise((resolve, reject) => {
      const query = includeUnavailable
        ? 'SELECT * FROM products ORDER BY created_at DESC'
        : 'SELECT * FROM products WHERE available = 1 ORDER BY created_at DESC';

      this.db.all(query, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        const products = rows.map(row => ({
          id: row.id,
          title: row.title,
          url: row.url,
          image: row.image,
          salePrice: row.sale_price,
          regularPrice: row.regular_price,
          price: row.price,
          location: row.location,
          phone: row.phone,
          monthly: row.monthly,
          available: row.available === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));

        resolve(products);
      });
    });
  }

  async getProductsCount() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM products WHERE available = 1', (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row.count);
      });
    });
  }

  async markProductUnavailable(productId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE products SET available = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [productId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes);
        }
      );
    });
  }

  async markProductAvailable(productId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE products SET available = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [productId],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes);
        }
      );
    });
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('Database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}