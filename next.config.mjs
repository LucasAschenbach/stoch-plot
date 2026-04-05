const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? ""
const defaultBasePath =
  process.env.GITHUB_ACTIONS === "true" && repoName && !repoName.endsWith(".github.io")
    ? `/${repoName}`
    : ""
const basePath = process.env.NEXT_BASE_PATH ?? defaultBasePath

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath || undefined,
}

export default nextConfig
