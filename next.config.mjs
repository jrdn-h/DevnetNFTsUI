/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "arweave.net" },
      { protocol: "https", hostname: "ipfs.io" },
      { protocol: "https", hostname: "nftstorage.link" },
      { protocol: "https", hostname: "*.pinata.cloud" },
      { protocol: "https", hostname: "*.arweave.net" },
      { protocol: "https", hostname: "*.ipfs.io" },
      // Add any other CDN you use for NFT images
    ],
  },
};

export default nextConfig;
