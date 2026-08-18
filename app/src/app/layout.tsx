import type { Metadata } from "next";
import Nav from "./Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Forecasting & Research Platform",
  description: "On-demand statistical match forecasts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <div className="page">{children}</div>
      </body>
    </html>
  );
}
