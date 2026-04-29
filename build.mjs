import * as esbuild from "esbuild";

const common = {
  bundle: true,
  format: "iife",
  target: "es2022",
  platform: "browser",
  minify: false,
  sourcemap: "inline",
  logLevel: "info",
};

async function build() {
  await esbuild.build({
    ...common,
    entryPoints: ["extension/src/background.ts"],
    outfile: "extension/dist/background.js",
  });

  await esbuild.build({
    ...common,
    entryPoints: ["extension/src/popup.ts"],
    outfile: "extension/dist/popup.js",
  });

  console.log("Extension built.");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
