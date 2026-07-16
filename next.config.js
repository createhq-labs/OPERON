/** @type {import('next').NextConfig} */
const nextConfig = {
  // ----------------------------------------------------------------
  // Security headers applied to every response
  // ----------------------------------------------------------------
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  // ----------------------------------------------------------------
  // Webpack: support large document parsers
  // ----------------------------------------------------------------
  webpack(config, { isServer }) {
    // pdfjs-dist requires canvas in Node — skip it server-side
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }

    return config;
  },

  // ----------------------------------------------------------------
  // Transpile packages that ship ES modules
  // ----------------------------------------------------------------
  transpilePackages: ["@supabase/supabase-js"],

  // ----------------------------------------------------------------
  // Image domains (Google user avatars, Drive thumbnails)
  // ----------------------------------------------------------------
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "drive.google.com",
      },
    ],
  },

};

module.exports = nextConfig;