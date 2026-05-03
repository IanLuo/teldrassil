import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teldrassil - Agentic Micro-Kernel',
  description: 'Managing UI for the Teldrassil framework',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
