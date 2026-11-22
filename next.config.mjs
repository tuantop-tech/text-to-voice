/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Tranh tinh trang tab cu gi HTML/JS chunk cu sau moi lan build lai
  // -> "Application error: a client-side exception ...", phai refresh moi het.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
