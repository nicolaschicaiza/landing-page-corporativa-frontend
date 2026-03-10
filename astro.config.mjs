import { defineConfig } from "astro/config";
import netlify from "@astrojs/netlify";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: netlify({
    edgeMiddleware: false
  }),
  site: "https://example.netlify.app",
  vite: {
    plugins: [tailwindcss()]
  }
});
