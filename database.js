import pg from 'pg';
import dotenv from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

dotenv.config();

const { Client } = pg;

export class GearHunterDB {
  constructor() {
    this.client = null;
    this.secretClient = new SecretManagerServiceClient();
  }

  async getSecret(secretName) {
    try {
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gearhunted';
      const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
      
      const [version] = await this.secretClient.accessSecretVersion({ name });
      const payload = version.payload.data.toString('utf8');
      return payload;
    } catch (error) {
      console.error(`Error accessing secret ${secretName}:`, error);
      // Fallback to environment variable if secret manager fails
      return process.env.DB_PASSWORD;
    }
  }

  async init() {
    try {
      // Get database password from Secret Manager or environment variable
      const dbPassword = process.env.DB_PASSWORD || await this.getSecret('DB_PASSWORD');
      
      // Cloud Run with Cloud SQL uses Unix domain sockets
      const isCloudRun = process.env.NODE_ENV === 'production' && process.env.INSTANCE_CONNECTION_NAME;
      
      let connectionConfig;
      
      if (isCloudRun) {
        // Production: Use Cloud SQL Unix socket connection
        const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
        connectionConfig = {
          host: `/cloudsql/${instanceConnectionName}`,
          database: process.env.DB_NAME || 'gearhunted',
          user: process.env.DB_USER || 'postgres',
          password: dbPassword,
        };
        console.log('Using Cloud SQL Unix socket connection');
      } else {
        // Development: Use TCP connection
        connectionConfig = {
          host: process.env.DB_HOST || 'localhost',
          port: process.env.DB_PORT || 5432,
          database: process.env.DB_NAME || 'gearhunted',
          user: process.env.DB_USER || 'postgres',
          password: dbPassword,
          ssl: false
        };
        console.log('Using TCP connection for local development');
      }

      this.client = new Client(connectionConfig);

      await this.client.connect();
      console.log('Connected to PostgreSQL database');
      await this.createTables();
    } catch (error) {
      console.error('Database connection error:', error);
      throw error;
    }
  }

  async createTables() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        title TEXT,
        url TEXT,
        image TEXT,
        sale_price DECIMAL(10,2),
        regular_price DECIMAL(10,2),
        price DECIMAL(10,2),
        location TEXT,
        phone TEXT,
        monthly DECIMAL(10,2),
        available INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    try {
      await this.client.query(createTableSQL);
      console.log('Products table created or verified');
    } catch (error) {
      console.error('Error creating tables:', error);
      throw error;
    }
  }

  async productExists(id) {
    try {
      const result = await this.client.query('SELECT id FROM products WHERE id = $1', [id]);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking if product exists:', error);
      throw error;
    }
  }

  async addProduct(product) {
    const insertSQL = `
      INSERT INTO products (
        id, title, url, image, sale_price, regular_price, 
        price, location, phone, monthly, available, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        image = EXCLUDED.image,
        sale_price = EXCLUDED.sale_price,
        regular_price = EXCLUDED.regular_price,
        price = EXCLUDED.price,
        location = EXCLUDED.location,
        phone = EXCLUDED.phone,
        monthly = EXCLUDED.monthly,
        available = 1,
        updated_at = CURRENT_TIMESTAMP
    `;

    try {
      const result = await this.client.query(insertSQL, [
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
      ]);
      return result.rowCount;
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
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
      const placeholders = scrapedIds.map((_, index) => `$${index + 1}`).join(',');
      const markUnavailableSQL = `
        UPDATE products
        SET available = 0, updated_at = CURRENT_TIMESTAMP
        WHERE available = 1 AND id NOT IN (${placeholders})
      `;

      try {
        const result = await this.client.query(markUnavailableSQL, scrapedIds);
        markedUnavailable = result.rowCount;
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
    try {
      const query = includeUnavailable
        ? 'SELECT * FROM products ORDER BY id DESC'
        : 'SELECT * FROM products WHERE available = 1 ORDER BY id DESC';

      const result = await this.client.query(query);

      const products = result.rows.map(row => ({
        id: row.id,
        title: row.title,
        url: row.url,
        image: row.image,
        salePrice: parseFloat(row.sale_price) || null,
        regularPrice: parseFloat(row.regular_price) || null,
        price: parseFloat(row.price) || null,
        location: row.location,
        phone: row.phone,
        monthly: parseFloat(row.monthly) || null,
        available: row.available === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      return products;
    } catch (error) {
      console.error('Error getting all products:', error);
      throw error;
    }
  }

  async getProductsCount() {
    try {
      const result = await this.client.query('SELECT COUNT(*) as count FROM products WHERE available = 1');
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting products count:', error);
      throw error;
    }
  }

  async getProductsSince(sinceTimestamp) {
    try {
      const query = `
        SELECT * FROM products
        WHERE created_at > to_timestamp($1)
        AND available = 1
        ORDER BY id DESC
      `;

      const result = await this.client.query(query, [Math.floor(sinceTimestamp / 1000)]);

      const products = result.rows.map(row => ({
        id: row.id,
        title: row.title,
        url: row.url,
        image: row.image,
        salePrice: parseFloat(row.sale_price) || null,
        regularPrice: parseFloat(row.regular_price) || null,
        price: parseFloat(row.price) || null,
        location: row.location,
        phone: row.phone,
        monthly: parseFloat(row.monthly) || null,
        available: row.available === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      return products;
    } catch (error) {
      console.error('Error getting products since timestamp:', error);
      throw error;
    }
  }

  async markProductUnavailable(productId) {
    try {
      const result = await this.client.query(
        'UPDATE products SET available = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [productId]
      );
      return result.rowCount;
    } catch (error) {
      console.error('Error marking product unavailable:', error);
      throw error;
    }
  }

  async markProductAvailable(productId) {
    try {
      const result = await this.client.query(
        'UPDATE products SET available = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [productId]
      );
      return result.rowCount;
    } catch (error) {
      console.error('Error marking product available:', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.client) {
        await this.client.end();
        console.log('Database connection closed');
      }
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
}