// Next.js startup hook: apply admin-set integration keys (AppSetting) before
// the first request, then keep them in sync. See src/lib/app-settings.ts.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { loadAppSettings, startAppSettingsSync } = await import('./lib/app-settings');
  await loadAppSettings();
  startAppSettingsSync();
}
