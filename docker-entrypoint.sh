#!/bin/sh
set -e

echo "▶ Running DB migrations..."
npx prisma migrate deploy

if [ "$SEED_DB" = "true" ]; then
  echo "▶ Seeding database..."
  npm run db:seed
fi

echo "▶ Starting Next.js..."
exec npm start
