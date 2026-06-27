import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json' with { type: 'json' };
import { PORTS } from './shared/ports';

// https://vite.dev/config/

function injectUserPlugin() {
  return {
    name: 'inject-window-user',
    transformIndexHtml: {
      order: 'pre' as const,
      async handler(html: string) {
        let userData: { userId: string; name?: string } | null = null
        try {
          const { execSync } = await import('child_process')
          const gitUser = execSync('git config user.name', { encoding: 'utf-8' }).trim()
          if (gitUser) {
            userData = { userId: gitUser, name: gitUser }
          }
        } catch { /* git not configured */ }

        if (!userData) {
          const { userInfo } = await import('os')
          const user = userInfo().username
          userData = { userId: user, name: user }
        }

        return html.replace(
          '<script>window.user = null</script>',
          `<script>window.user = ${JSON.stringify(userData)}</script>`,
        )
      },
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [injectUserPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web'),
      '@shared': path.resolve(__dirname, './shared'),
    }
  },
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
  server: {
    host: '0.0.0.0',
    port: PORTS.DEV_UI,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.TEEMAI_DEV_SERVER_PORT ?? PORTS.DEV_SERVER}`,
        changeOrigin: true
      },
      '/avatars': {
        target: `http://localhost:${process.env.TEEMAI_DEV_SERVER_PORT ?? PORTS.DEV_SERVER}`,
        changeOrigin: true
      },
      '/ws': {
        target: `ws://localhost:${process.env.TEEMAI_DEV_SERVER_PORT ?? PORTS.DEV_SERVER}`,
        ws: true
      },
      '/element/': {
        target: `http://localhost:${process.env.TEEMAI_DEV_SERVER_PORT ?? PORTS.DEV_SERVER}`,
        changeOrigin: true,
      },
    },
  },
})
