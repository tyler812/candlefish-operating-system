import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Candlefish Operating System v2.0 Dashboard',
  description: 'Real-time visibility into the entire Candlefish Operating System',
  keywords: ['dashboard', 'operating system', 'candlefish', 'project management', 'analytics'],
  authors: [{ name: 'Candlefish AI' }],
  creator: 'Candlefish AI',
  publisher: 'Candlefish AI',
  robots: 'noindex, nofollow', // Private internal dashboard
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#0ea5e9',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Candlefish OS v2.0 Dashboard',
    description: 'Real-time system visibility and management',
    url: 'https://dashboard.candlefish.ai',
    siteName: 'Candlefish Dashboard',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Candlefish OS v2.0 Dashboard',
    description: 'Real-time system visibility and management',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Prevent flash of unstyled content
              (function() {
                var theme = localStorage.getItem('theme') || 'light';
                document.documentElement.classList.add(theme);
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased`} suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
        <div id="modal-root" />
        <div id="tooltip-root" />
      </body>
    </html>
  );
}