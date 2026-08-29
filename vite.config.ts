import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import adonisjs from '@adonisjs/vite/client'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    adonisjs({ entryPoints: ['inertia/app.ts'], reload: ['resources/views/**/*.edge'] }),
    tailwindcss(),
  ],

  // Inertia SSR is disabled (see config/inertia.ts), so only build the
  // client environment. Vite 8's Builder API otherwise also builds a
  // default "ssr" environment, which — with no serverEntryPoints configured
  // for the adonisjs plugin — shares the client's outDir and overwrites its
  // manifest.json with SSR chunks that leave npm imports unbundled.
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client)
    },
  },

  resolve: {
    alias: {
      '~/': `${import.meta.dirname}/inertia/`,
      '@generated': `${import.meta.dirname}/.adonisjs/client/`,
    },
  },

  server: {
    watch: {
      ignored: ['**/storage/**', '**/tmp/**'],
    },
  },
})
