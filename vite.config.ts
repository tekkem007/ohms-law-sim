/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// base: './' keeps asset URLs relative so the built bundle can be served from
// any sub-path (e.g. GitHub Pages) without rewriting.
export default defineConfig({
  base: './',
  server: {
    // Vite rejects requests whose Host header it doesn't recognise (DNS-rebinding
    // protection). Allow Cloudflare quick-tunnel hostnames so the site can be
    // opened on a phone via a *.trycloudflare.com link during testing.
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
  build: {
    target: 'es2020',
  },
  test: {
    // The physics / mapping / formatting layers are pure and DOM-free, so the
    // unit tests run in the fast Node environment without jsdom.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
