import type { MetadataRoute } from "next";
import { editorialArticles } from "@/lib/editorial/articles";

const baseUrl = "https://ratemanifest.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
    },
    {
      url: `${baseUrl}/hotels`,
    },
    {
      url: `${baseUrl}/hotels-flights`,
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
      url: `${baseUrl}/partners`,
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
    { url: `${baseUrl}/travel-intelligence` },
    ...editorialArticles.map((article) => ({ url: `${baseUrl}/travel-intelligence/${article.slug}` })),
  ];
}