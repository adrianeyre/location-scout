// Bundles the website's product illustrations (demos/main.tsx and the
// Stageshow kit in kit/) into one script and one stylesheet, which
// build.ts calls and the page loads beside its own. `pnpm --filter
// @location-scout/site dev` serves the page with them for working on them;
// its double-brace placeholders are left as they are there.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    copyPublicDir: false,
    cssCodeSplit: false,
    rolldownOptions: {
      input: { demos: "demos/main.tsx" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        // One stylesheet, named for the script it belongs to.
        assetFileNames: ({ names }) =>
          names.some((name) => name.endsWith(".css"))
            ? "demos.css"
            : "[name][extname]",
      },
    },
  },
});
