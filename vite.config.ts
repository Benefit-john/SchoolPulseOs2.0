import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({ server: { entry: "server" } }),
    react(),
    tailwindcss(),
    nitro(),
    tsconfigPaths(),
  ],
  server: {
    allowedHosts: [
      "8080-isabvmzjx8spvu2y966qw-3acfbca8.us4.manus.computer",
      "4173-ix1saqqk4l88zidefqvq1-1d5ae024.us4.manus.computer",
    ],
  },
});
