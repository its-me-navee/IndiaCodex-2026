import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Mesh's browser transaction serializer uses Node-compatible crypto and
    // stream APIs internally. Browserify-backed shims provide those primitives;
    // no keys or secret material are persisted by this layer.
    nodePolyfills({
      include: ["buffer", "crypto", "events", "process", "stream", "util", "vm"],
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // Mesh currently pulls a libsodium ESM wrapper whose raw module is
      // published in a sibling package. The CJS entry resolves that dependency.
      "libsodium-wrappers-sumo": path.resolve(
        root,
        "node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js",
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("/node_modules/@meshsdk/") ||
            id.includes("/node_modules/@cardano-sdk/") ||
            id.includes("/node_modules/@harmoniclabs/") ||
            id.includes("/node_modules/libsodium")
          ) return "mesh-cardano";
          if (
            id.includes("/node_modules/@cardano-foundation/") ||
            id.includes("/node_modules/@fabianbormann/") ||
            id.includes("/node_modules/react-qrcode-logo/")
          ) return "wallet-connect";
        },
      },
    },
  },
});
