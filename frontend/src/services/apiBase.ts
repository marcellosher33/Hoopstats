const raw = process.env.EXPO_PUBLIC_BACKEND_URL;

export const API_BASE_URL = raw ? raw.replace(/\/$/, '') : '';

export function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error(
      'Missing EXPO_PUBLIC_BACKEND_URL. Set it in .env for dev and in eas.json for builds.'
    );
  }
  return API_BASE_URL;
}
