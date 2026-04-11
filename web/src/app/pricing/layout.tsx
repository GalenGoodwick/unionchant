import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free to start. Scale when you need to. Run deliberations, gather consensus, and make better collective decisions.',
}

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
