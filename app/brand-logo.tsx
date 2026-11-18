import Image from 'next/image'

export function BrandLogo({ className }: { className: string }) {
  return (
    <Image
      src="/hbc-logo.png"
      alt="Logo Yayasan Habibi Bina Cendikia"
      width={58}
      height={58}
      className={className}
    />
  )
}
