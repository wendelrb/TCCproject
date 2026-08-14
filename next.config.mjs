/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A demo lê Postgres direto do server component; `pg` não vai para o bundle.
  serverExternalPackages: ['pg'],
};

export default nextConfig;
