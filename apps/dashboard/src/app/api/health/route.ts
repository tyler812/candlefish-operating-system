import { NextResponse } from 'next/server';

export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      dashboard: 'healthy',
      auth: 'healthy',
    },
  };

  return NextResponse.json(health, { status: 200 });
}