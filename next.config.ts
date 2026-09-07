import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Tree-shake the icon + radix barrels: without this every page ships
    // the whole lucide-react / radix packages.
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
    ],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Thumbnails are small: don't generate huge variants.
    deviceSizes: [320, 480, 640, 828],
    imageSizes: [64, 96, 128, 256],
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "i9.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "avatar.vercel.sh" }
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.youtube.com https://s.ytimg.com https://js-cdn.music.apple.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://i.ytimg.com https://i9.ytimg.com https://yt3.ggpht.com https://images.unsplash.com https://i.scdn.co https://is1-ssl.mzstatic.com https://is2-ssl.mzstatic.com https://is3-ssl.mzstatic.com https://is4-ssl.mzstatic.com https://is5-ssl.mzstatic.com https://api.dicebear.com https://avatar.vercel.sh",
              "media-src 'self' blob: https://*.youtube.com https://*.googlevideo.com https://audio-ssl.itunes.apple.com",
              "connect-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com https://*.youtube.com https://*.googlevideo.com https://api.dicebear.com https://lrclib.net https://api.music.apple.com https://amp-api.music.apple.com",
              "frame-src https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com",
              "font-src 'self' data:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
