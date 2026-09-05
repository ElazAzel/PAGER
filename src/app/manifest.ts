import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { id: "/", name: "PAGER", short_name: "PAGER", description: "A focused page for your work", start_url: "/", scope: "/", display: "standalone", background_color: "#f6f3ee", theme_color: "#f6f3ee", icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ] };
}
