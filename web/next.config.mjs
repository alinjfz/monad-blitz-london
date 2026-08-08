/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@getpara/react-sdk", "@getpara/evm-wallet-connectors"],
};

export default nextConfig;
