import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {}, // Empty config to silence Turbopack warning
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("stream-browserify"),
      buffer: require.resolve("buffer/"),
    };

    config.plugins.push(
      new (require("webpack").ProvidePlugin)({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
      })
    );

    return config;
  },
};

export default nextConfig;
