import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? ""
const defaultBasePath =
  process.env.GITHUB_ACTIONS === "true" && repoName && !repoName.endsWith(".github.io")
    ? `/${repoName}`
    : ""
const basePath = process.env.NEXT_BASE_PATH ?? defaultBasePath
const withBasePath = (path: string) => `${basePath}${path}`

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: 'Desmos for Stochastic Processes',
  description: 'Interactive notebook for stochastic processes, sampled paths, and endpoint laws.',
  generator: 'v0.app',
  icons: {
    icon: withBasePath('/icon.svg'),
    shortcut: withBasePath('/icon.svg'),
    apple: withBasePath('/apple-icon.png'),
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
