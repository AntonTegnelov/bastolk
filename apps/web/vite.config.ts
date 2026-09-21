import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The container binds the port, so listening on localhost only would leave
    // the host's mapping unreachable.
    host: true,
    port: 5173,
    watch: {
      // The checkout is a 9p bind mount from the Windows host, where inotify
      // events do not reach the container. Without polling the dev server
      // keeps serving the previous file and changes appear to do nothing.
      usePolling: true,
      interval: 300,
    },
  },
});
