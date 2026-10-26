import { build } from "esbuild";

/**
 * Bundles the standalone background processes (`worker`, `wa-gateway`) from the same source as the
 * web app. npm packages stay external and load from node_modules at runtime; `server-only` is
 * replaced by an empty module because these processes are server code by definition.
 */
const serverOnly = {
  name: "server-only",
  setup(context) {
    context.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
    context.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
  },
};

const result = await build({
  entryPoints: { worker: "src/roles/worker.ts", "wa-gateway": "src/roles/wa-gateway.ts" },
  outdir: "dist/roles",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  packages: "external",
  plugins: [serverOnly],
  sourcemap: true,
  metafile: true,
  logLevel: "info",
});

const forbidden = Object.keys(result.metafile.inputs).filter(input => input.startsWith("node_modules/next/") || input.includes("next/cache"));
if (forbidden.length) throw new Error(`Background roles must not import Next.js modules: ${forbidden.join(", ")}`);
