import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// MaestrOS frontend — Vite + React + TS.
// Standalone on mock data by default (VITE_USE_MOCK=true); flip to a live backend in Part 3.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
});
