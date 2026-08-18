"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Match Analysis" },
  { href: "/leagues", label: "League Explorer" },
  { href: "/sportybet", label: "SportyBet Tools" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <div className="nav-inner">
        <span className="nav-brand">⚽ Forecasting Platform</span>
        <div className="nav-links">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`nav-link ${pathname === link.href ? "active" : ""}`}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
