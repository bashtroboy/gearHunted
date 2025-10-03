#!/bin/bash

# Complete Cloud SQL setup after instance creation
set -e

PROJECT_ID="gearhunted"
INSTANCE_NAME="gearhunted-db"
DB_NAME="gearhunted"
DB_USER="postgres"

echo "Completing Cloud SQL setup..."

# Wait for instance to be ready
echo "Waiting for instance to be ready..."
while [ "$(gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID --format='value(state)')" != "RUNNABLE" ]; do
    echo "Instance is still being created, waiting..."
    sleep 10
done

echo "Instance is ready!"

# Set the postgres user password
echo "Setting postgres user password..."
echo "Please enter a secure password for the postgres user:"
read -s DB_PASSWORD
gcloud sql users set-password $DB_USER \
    --instance=$INSTANCE_NAME \
    --password=$DB_PASSWORD \
    --project=$PROJECT_ID

# Create the application database
echo "Creating application database..."
gcloud sql databases create $DB_NAME --instance=$INSTANCE_NAME --project=$PROJECT_ID

echo ""
echo "Cloud SQL setup complete!"
echo ""
echo "Instance details:"
echo "  Instance name: $INSTANCE_NAME"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo "  Private IP: $(gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID --format='value(ipAddresses[0].ipAddress)')"
echo ""
echo "For local development, you'll need to connect through private IP."
echo "Update your .env file with:"
echo "  DB_HOST=$(gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT_ID --format='value(ipAddresses[0].ipAddress)')"
echo "  DB_PORT=5432"
echo "  DB_NAME=$DB_NAME"
echo "  DB_USER=$DB_USER"
echo "  DB_PASSWORD=<your_password>"
echo ""
echo "For production deployment via Cloud Run, the connection is handled automatically."