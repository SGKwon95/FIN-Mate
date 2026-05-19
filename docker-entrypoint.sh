#!/bin/sh
set -e

echo "▶ Syncing DB schema..."
npx prisma db push --accept-data-loss

if [ "$SEED_DB" = "true" ]; then
  echo "▶ Seeding database..."
  npm run db:seed
fi

echo "▶ Starting Next.js..."
exec npm start
