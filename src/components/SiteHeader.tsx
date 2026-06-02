import Link from "next/link";
import { getSession } from "@/lib/session";
import HeaderNav from "@/components/HeaderNav";
import { t } from "@/i18n";

export default async function SiteHeader() {
  const session = await getSession();
  const signedIn = !!session;
  return (
    <header className="nav-bar relative">
      <div className="container-app flex h-16 items-center justify-between">
        <Link href="/" className="font-heading text-xl font-extrabold text-gradient-hero">
          {t.app.name}
        </Link>
        <HeaderNav signedIn={signedIn} />
      </div>
    </header>
  );
}
