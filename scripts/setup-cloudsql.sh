#!/bin/bash

# Google Cloud SQL Setup Script for GearHunter
# This script sets up a PostgreSQL instance on Google Cloud SQL

set -e

PROJECT_ID="gearhunted"
REGION="us-east1"
INSTANCE_NAME="gearhunted-db"
DB_NAME="gearhunted"
DB_USER="postgres"

echo "Setting up Google Cloud SQL for GearHunter..."

# Set the project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "Enabling required Google Cloud APIs..."
gcloud services enable compute.googleapis.com
gcloud services enable servicenetworking.googleapis.com
gcloud services enable sqladmin.googleapis.com

# Allocate IP range for private services
echo "Setting up private services access..."
gcloud compute addresses create google-managed-services-default \
    --global \
    --purpose=VPC_PEERING \
    --prefix-length=16 \
    --network=projects/$PROJECT_ID/global/networks/default || echo "Address range may already exist"

# Create private connection
gcloud services vpc-peerings connect \
    --service=servicenetworking.googleapis.com \
    --ranges=google-managed-services-default \
    --network=default \
    --project=$PROJECT_ID || echo "VPC peering may already exist"

# Create Cloud SQL PostgreSQL instance with private IP
echo "Creating Cloud SQL PostgreSQL instance..."
gcloud sql instances create $INSTANCE_NAME \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=$REGION \
    --storage-type=SSD \
    --storage-size=10GB \
    --storage-auto-increase \
    --backup-start-time=03:00 \
    --maintenance-window-day=SUN \
    --maintenance-window-hour=04 \
    --maintenance-release-channel=production \
    --network=projects/$PROJECT_ID/global/networks/default \
    --no-assign-ip

# Set the postgres user password
echo "Setting postgres user password..."
echo "Please enter a secure password for the postgres user:"
read -s DB_PASSWORD
gcloud sql users set-password $DB_USER \
    --instance=$INSTANCE_NAME \
    --password=$DB_PASSWORD

# Create the application database
echo "Creating application database..."
gcloud sql databases create $DB_NAME --instance=$INSTANCE_NAME

# Enable Cloud SQL Admin API if not already enabled
echo "Enabling Cloud SQL Admin API..."
gcloud services enable sqladmin.googleapis.com

echo ""
echo "Cloud SQL setup complete!"
echo ""
echo "Instance details:"
echo "  Instance name: $INSTANCE_NAME"
echo "  Region: $REGION"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""
echo "To connect from your local machine:"
echo "1. Install Cloud SQL Proxy:"
echo "   gcloud components install cloud-sql-proxy"
echo ""
echo "2. Start the proxy:"
echo "   cloud-sql-proxy $PROJECT_ID:$REGION:$INSTANCE_NAME"
echo ""
echo "3. Update your .env file with:"
echo "   DB_HOST=127.0.0.1"
echo "   DB_PORT=5432"
echo "   DB_NAME=$DB_NAME"
echo "   DB_USER=$DB_USER"
echo "   DB_PASSWORD=<your_password>"
echo ""
echo "For production deployment, the connection is handled automatically via Cloud Run."