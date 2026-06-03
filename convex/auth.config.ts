function normalizeSiteUrl(value: string | undefined) {
  if (!value) return undefined
  if (value.startsWith("http://") || value.startsWith("https://")) return value
  return `https://${value}`
}

const siteUrl =
  normalizeSiteUrl(process.env.CONVEX_SITE_URL) ??
  normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  normalizeSiteUrl(process.env.VERCEL_URL)

if (!siteUrl) {
  throw new Error(
    "Missing Convex Auth site URL. Set CONVEX_SITE_URL to your deployed frontend origin, or deploy through Vercel so the build can infer it.",
  )
}

export default {
  providers: [
    {
      domain: siteUrl,
      applicationID: "convex",
    },
  ],
};
