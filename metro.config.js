const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// three.js: use the ES-module build. Metro resolves package exports with the
// "require" condition, which selects three.cjs — a deprecated build that calls
// Node's process.emitWarning at load and crashes in React Native.
const THREE_ESM = path.resolve(__dirname, "node_modules/three/build/three.module.js");
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "three") {
    return { type: "sourceFile", filePath: THREE_ESM };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
