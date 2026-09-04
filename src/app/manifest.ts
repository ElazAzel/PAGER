import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { name: "PAGER", short_name: "PAGER", description: "A focused page for your work", start_url: "/", display: "standalone", background_color: "#f6f3ee", theme_color: "#f6f3ee", icons: [] }; }
