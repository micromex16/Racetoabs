import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Micromex Command Center",
    short_name: "Command",
    description: "Rocks, picks, pipeline, comms — and a chief of staff.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#06070b",
    theme_color: "#06070b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Capture a thought", url: "/?capture=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Agent", url: "/agent", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
