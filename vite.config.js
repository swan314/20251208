// vite.config.js
import { exec } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

function openBrowserOnStart() {
  return {
    name: 'open-browser-on-start',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address()
        const port =
          typeof address === 'object' && address && 'port' in address
            ? address.port
            : server.config.server.port

        const url = `http://localhost:${port}/`

        if (process.platform === 'win32') {
          exec(`start "" "${url}"`)
          return
        }

        if (process.platform === 'darwin') {
          exec(`open "${url}"`)
          return
        }

        exec(`xdg-open "${url}"`)
      })
    },
  }
}

export default defineConfig({
  server: {
    host: 'localhost',
    open: false,
  },
  plugins: [openBrowserOnStart()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
