// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// `npm run build:static` sets STATIC_BUILD=1: no server at all, just dist/client (an index.html shell plus
// assets) that any static host can serve (Vercel, Netlify, GitHub Pages, S3, nginx). The app is client-rendered
// anyway: all data comes from the JSON API in the browser. The default `npm run build` keeps the original
// Lovable/Cloudflare SSR output so Lovable's own publishing still works.
const isStatic = process.env["STATIC_BUILD"] === "1";

// Where `npm run dev` forwards /api/* so the browser never needs CORS or a hard-coded backend URL.
const proxyTarget = process.env["VITE_PROXY_TARGET"] ?? "http://127.0.0.1:8000";

// The Aegis voice agent's token server (the elevenlabstest folder, `npm start`). /voice-api/token -> its /api/token.
const voiceTarget = process.env["VITE_VOICE_PROXY_TARGET"] ?? "http://127.0.0.1:3001";

export default defineConfig({
  ...(isStatic
    ? { nitro: false as const, tanstackStart: { spa: { enabled: true } } }
    : {
        tanstackStart: {
          // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
          // nitro/vite builds from this
          server: { entry: "server" },
        },
      }),
  vite: {
    server: {
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/voice-api": {
          target: voiceTarget,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/voice-api/, "/api"),
        },
      },
    },
    ...(isStatic ? { build: { outDir: "dist" } } : {}),
    // Pre-bundle UI deps up front so a mid-session re-optimization can't load a second React copy.
    optimizeDeps: {
      include: [
        "recharts",
        "sonner",
        "@radix-ui/react-switch",
        "@radix-ui/react-popover",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-label",
        "@radix-ui/react-slot",
        "@radix-ui/react-select",
        "@radix-ui/react-collapsible",
        "@radix-ui/react-tabs",
        "@radix-ui/react-toggle-group",
        "@radix-ui/react-separator",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-radio-group",
      ],
    },
  },
});
