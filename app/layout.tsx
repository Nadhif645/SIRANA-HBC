import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SIRANA HBC | Layanan Sarana dan Prasarana',
  description: 'Layanan booking ruangan dan pelaporan kerusakan SMP Habibi Bina Cendikia.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
