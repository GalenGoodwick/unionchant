import type { Metadata, Viewport } from 'next'
import { Source_Serif_4, Libre_Franklin, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
})

const libreFranklin = Libre_Franklin({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Unity Chant - Consensus at Scale',
    template: '%s | Unity Chant',
  },
  description: 'Holding quiet hope. Small group deliberation at any scale.',
  manifest: '/manifest.json',
  keywords: ['democracy', 'voting', 'deliberation', 'collective decision making', 'consensus', 'small groups'],
  authors: [{ name: 'Unity Chant' }],
  creator: 'Unity Chant',
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'https://unitychant.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Unity Chant',
    title: 'Unity Chant - Consensus at Scale',
    description: 'Holding quiet hope. Small group deliberation at any scale.',
    images: [{ url: '/api/og', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Unity Chant - Consensus at Scale',
    description: 'Holding quiet hope. Small group deliberation at any scale.',
    images: ['/api/og'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Unity Chant',
  },
}

export const viewport: Viewport = {
  themeColor: '#0c4a6e',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(e){}` }} />
      </head>
      <body className={`${libreFranklin.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} font-sans`}>
        <Providers>
          {children}
          <ServiceWorkerRegistration />
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  )
}
