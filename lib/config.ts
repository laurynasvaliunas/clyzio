/**
 * Centralized app configuration
 * Reads from environment variables — define EXPO_PUBLIC_MAPBOX_TOKEN in .env
 */

// Mapbox — public token read from .env
export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
