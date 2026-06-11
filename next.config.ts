import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', '125.191.115.238', 'localhost'],
  serverExternalPackages: [
    "better-sqlite3",
    "kafkajs",
    "minio",
    "@opentelemetry/sdk-node",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/resources",
    "@opentelemetry/semantic-conventions",
  ],
};

export default nextConfig;
