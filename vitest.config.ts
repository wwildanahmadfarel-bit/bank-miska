import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    // globals:true agar auto-cleanup @testing-library/react jalan antar test.
    globals: true,
    // threads: pool forks tak bisa start di Windows (timeout worker).
    pool: "threads",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    css: false,
  },
});
