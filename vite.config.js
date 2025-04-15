import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    https: {
      // Usar certificados auto-assinados para desenvolvimento
      // No ambiente de produção, use certificados reais
      key: fs.readFileSync(path.resolve(__dirname, "./.cert/key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "./.cert/cert.pem")),
    },
  },
});
