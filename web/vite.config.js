import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  resolve: {
    alias: {
      // Fix for node-vibrant in browser environment
      './colorSpaces': './colorSpaces.browser',
    }
  },
  optimizeDeps: {
    exclude: ['node-vibrant']
  }
});
