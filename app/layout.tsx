import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { siteBrand } from "../src/app-shell/site-brand";
import { AuthProvider } from "../src/app-shell/auth-provider";
import { GameProgressProvider } from "../src/platform/game-progress-provider";
import "./globals.css";
import { themeBootstrap } from "../src/platform/game-theme";
import { AUTH_PRESENTATION_COOKIE, parseAuthPresentation } from "../src/platform/auth-presentation";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialPresentation = parseAuthPresentation(cookieStore.get(AUTH_PRESENTATION_COOKIE)?.value);
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body><AuthProvider initialPresentation={initialPresentation}><GameProgressProvider>{children}</GameProgressProvider></AuthProvider></body>
    </html>
  );
}
