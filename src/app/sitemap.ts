import type { MetadataRoute } from "next";

const baseUrl = "https://ratemanifest.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
    },
    {
      url: `${baseUrl}/flights`,
    },
    {
      url: `${baseUrl}/rail`,
    },
    {
      url: `${baseUrl}/methodology`,
    },
    {
      url: `${baseUrl}/for-business`,
    },
    {
      url: `${baseUrl}/contact`,
    },
    {
      url: `${baseUrl}/privacy`,
    },
    {
      url: `${baseUrl}/terms`,
    },
  ];
}
