import "./globals.css";

export const metadata = {
  title: "The Wreck Works — LLM Game Factory",
  description: "Pipeline control panel: every step runnable by an LLM, a human, or a script — gated either way.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
