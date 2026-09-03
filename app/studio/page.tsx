import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../src/app-shell/site-header";
import { isLocalStudioHost } from "../../src/authoring/studio-access";
import { StudioDashboard } from "../../src/authoring/studio-dashboard";
import "../styles/studio.css";

export const metadata: Metadata = {
  title: "Puzzle Studio",
  robots: { index: false, follow: false },
};

export default async function StudioPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (process.env.NODE_ENV !== "development" || !isLocalStudioHost(host)) notFound();

  return (
    <div className="site-frame studio-site-frame">
      <SiteHeader />
      <StudioDashboard />
    </div>
  );
}
