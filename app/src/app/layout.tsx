import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Football Forecasting & Research Platform",
  description: "On-demand statistical match forecasts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
        {children}
      </body>
    </html>
  );
}
