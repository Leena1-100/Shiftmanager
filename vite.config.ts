import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Shown at the bottom of Settings so it's easy to tell which version a phone is running
function buildId(): string {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    /* not a git checkout */
  }
  return `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

// base './' so the build works from any sub-path (e.g. GitHub Pages /Shiftmanager/)
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
});
