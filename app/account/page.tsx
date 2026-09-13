import type { Metadata } from "next";
import { SiteHeader } from "../../src/app-shell/site-header";
import { AccountPage } from "../../src/account/account-page";
import "../styles/account.css";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default function AccountRoute() {
  return (
    <div className="site-frame account-site-frame">
      <SiteHeader />
      <AccountPage />
    </div>
  );
}
