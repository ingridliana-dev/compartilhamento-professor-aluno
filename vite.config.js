import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// Determinar se estamos em produção (Railway) ou desenvolvimento
const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.RAILWAY_ENVIRONMENT === "production";

// Configurar HTTPS apenas para desenvolvimento
let httpsOptions = {};

if (!isProduction) {
  try {
    httpsOptions = {
      key: fs.readFileSync(path.resolve(__dirname, "./.cert/key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "./.cert/cert.pem")),
    };
  } catch (error) {
    console.warn(
      "Certificados SSL não encontrados. Usando HTTP para desenvolvimento."
    );
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: process.env.PORT || 3000,
    // Usar HTTPS apenas em desenvolvimento e se os certificados estiverem disponíveis
    https: Object.keys(httpsOptions).length > 0 ? httpsOptions : false,
  },
});
