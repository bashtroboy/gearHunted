# PostgreSQL Migration Guide

This guide explains how to migrate GearHunter from SQLite to PostgreSQL with Google Cloud SQL.

## Prerequisites

1. Google Cloud SDK installed and configured
2. PostgreSQL client (optional, for local testing)
3. Node.js and npm dependencies installed

## Local Development Setup

### 1. Set up local PostgreSQL (optional)

For local development, you can use a local PostgreSQL instance:

```bash
# Install PostgreSQL (macOS with Homebrew)
brew install postgresql
brew services start postgresql

# Create database and user
psql -U postgres -c "CREATE DATABASE gearhunted;"
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gearhunted
DB_USER=postgres
DB_PASSWORD=your_password
```

### 3. Test the connection

```bash
node test-db.js
```

## Google Cloud SQL Setup

### 1. Run the setup script

```bash
./scripts/setup-cloudsql.sh
```

This script will:
- Create a Cloud SQL PostgreSQL instance
- Set up the database and user
- Configure backup and maintenance windows
- Enable required APIs

### 2. Connect via Cloud SQL Proxy (for local development)

```bash
# Install Cloud SQL Proxy
gcloud components install cloud-sql-proxy

# Start the proxy
cloud-sql-proxy gearhunted:us-east1:gearhunted-db
```

Update your `.env` file:

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=gearhunted
DB_USER=postgres
DB_PASSWORD=<your_password>
```

## Production Deployment

### 1. Deploy to Cloud Run

The app is configured to automatically connect to Cloud SQL when deployed:

```bash
npm run deploy
```

### 2. Environment Variables

The production environment automatically uses:
- Cloud SQL connection via Unix socket
- Environment variables from Cloud Run
- SSL connection for security

## Migration from SQLite

### 1. Export existing data (if needed)

If you have existing SQLite data to migrate:

```bash
# Export SQLite data to SQL
sqlite3 database/gearhunter.db .dump > backup.sql
```

### 2. Import to PostgreSQL

```bash
# Connect to your PostgreSQL instance
psql -h localhost -U postgres -d gearhunted < backup.sql
```

Note: You may need to adjust the SQL syntax for PostgreSQL compatibility.

## Key Changes

### Database Configuration

- **SQLite**: Single file database with file-based connections
- **PostgreSQL**: Network-based connections with connection pooling

### Data Types

- `REAL` → `DECIMAL(10,2)` for prices
- `DATETIME` → `TIMESTAMP` for timestamps
- `INTEGER` remains the same for boolean values

### Query Syntax

- Parameter placeholders: `?` → `$1, $2, $3...`
- `INSERT OR REPLACE` → `INSERT ... ON CONFLICT ... DO UPDATE`
- `datetime()` → `to_timestamp()`

### Connection Management

- **SQLite**: Callback-based with `sqlite3` package
- **PostgreSQL**: Promise-based with `pg` package

## Testing

### Run the database test

```bash
node test-db.js
```

### Run the scraper test

```bash
npm run scrape
```

### Start the server

```bash
npm start
```

## Troubleshooting

### Connection Issues

1. **Local PostgreSQL**: Ensure service is running
2. **Cloud SQL**: Check Cloud SQL Proxy is running
3. **Production**: Verify Cloud SQL instance is accessible

### Permission Issues

1. Ensure database user has proper permissions
2. Check firewall rules for Cloud SQL
3. Verify service account permissions for Cloud Run

### Migration Issues

1. Check PostgreSQL logs for errors
2. Verify data types are compatible
3. Test queries manually in PostgreSQL client

## Monitoring

### Cloud SQL Metrics

- CPU utilization
- Memory usage
- Connection count
- Query performance

### Application Logs

- Database connection status
- Query execution times
- Error rates

## Backup and Recovery

### Automated Backups

Cloud SQL automatically creates daily backups at 3:00 AM.

### Manual Backup

```bash
gcloud sql export sql gearhunted-db gs://your-bucket/backup-$(date +%Y%m%d).sql
```

### Point-in-time Recovery

Cloud SQL supports point-in-time recovery for up to 7 days.