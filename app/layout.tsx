import type { Metadata } from "next";
import { headers } from "next/headers";
import { siteBrand } from "../src/app-shell/site-brand";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const socialImage = `${origin}/og.png`;
  const description = siteBrand.description;

  return {
    metadataBase: new URL(origin),
    title: {
      default: siteBrand.name,
      template: `%s · ${siteBrand.name}`,
    },
    description,
    openGraph: {
      type: "website",
      siteName: siteBrand.name,
      title: siteBrand.name,
      description,
      images: [{ url: socialImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: siteBrand.name,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
