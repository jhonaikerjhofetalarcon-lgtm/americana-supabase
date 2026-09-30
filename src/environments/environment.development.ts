export const environment = {
  production: false,
  // Desarrollo usa el mismo proyecto remoto que ya contiene usuarios y migraciones.
  supabaseUrl: 'https://cnwnecyodyxoszvmfxuc.supabase.co',
  // Esta es la clave pública anon; las claves privilegiadas permanecen en Edge Functions.
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNud25lY3lvZHl4b3N6dm1meHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDEyODYsImV4cCI6MjEwNDUxNzI4Nn0.-MPsTczDzcOZ8Nark3KSarsVk7LmA83PID-HRs2JX9I',
  authEmailDomain: 'auth.dental-americana.invalid',
} as const;
