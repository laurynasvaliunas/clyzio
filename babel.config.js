module.exports = function (api) {
  api.cache(true);

  const plugins = ["react-native-reanimated/plugin"];

  // Strip console.log/warn/debug in production builds (keep console.error)
  if (process.env.NODE_ENV === "production") {
    plugins.push([
      "transform-remove-console",
      { exclude: ["error"] },
    ]);
  }

  return {
    presets: ["babel-preset-expo"],
    plugins,
  };
};
