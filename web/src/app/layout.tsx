import type { Metadata, Viewport } from 'next'
import { Source_Serif_4, Libre_Franklin, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'

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
    default: 'Union Chant - Collective Decision Making',
    template: '%s | Union Chant',
  },
  description: 'Collective decision-making for the modern age. Small group deliberation at any scale.',
  manifest: '/manifest.json',
  keywords: ['democracy', 'voting', 'deliberation', 'collective decision making', 'consensus', 'small groups'],
  authors: [{ name: 'Union Chant' }],
  creator: 'Union Chant',
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'https://unionchant.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'Union Chant',
    title: 'Union Chant - Collective Decision Making',
    description: 'Scale is not achieved by enlarging a conversation. It is achieved by multiplying conversations.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Union Chant - Collective Decision Making',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Union Chant - Collective Decision Making',
    description: 'Small group deliberation at any scale. True democracy through structured conversation.',
    images: ['/og-image.png'],
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
    title: 'Union Chant',
  },
}

export const viewport: Viewport = {
  themeColor: '#0c4a6e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={`${libreFranklin.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} font-sans`}>
        <Providers>
          {children}
          <ServiceWorkerRegistration />
        </Providers>
      </body>
    </html>
  )
}
