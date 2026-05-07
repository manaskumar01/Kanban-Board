import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://127.0.0.1:5001",
      "/boards": "http://127.0.0.1:5001",
      "/lists": "http://127.0.0.1:5001",
      "/tasks": "http://127.0.0.1:5001",
      "/socket.io": {
        target: "http://127.0.0.1:5001",
        ws: true,
      },
    },
  },
});
