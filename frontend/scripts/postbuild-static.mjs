// TanStack Start's SPA build emits dist/client/_shell.html. Static hosts want index.html (served for "/")
// and a 404.html that is the same shell, so deep links like /claims reload correctly on GitHub Pages too.
import { copyFileSync, existsSync } from "node:fs";

const dir = "dist/client";
if (!existsSync(`${dir}/_shell.html`)) {
  console.error("postbuild-static: dist/client/_shell.html missing. Did the static build run?");
  process.exit(1);
}
copyFileSync(`${dir}/_shell.html`, `${dir}/index.html`);
copyFileSync(`${dir}/_shell.html`, `${dir}/404.html`);
console.log("postbuild-static: wrote index.html and 404.html");
