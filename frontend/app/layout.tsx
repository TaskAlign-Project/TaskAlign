import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"
import { Toaster } from "sonner"
import { TopNav } from "@/components/top-nav"
import "./globals.css"

const _inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const _jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" })

export const metadata: Metadata = {
  title: "TaskAlign - Factory Scheduling System",
  description:
    "GA-assisted injection molding monthly planning and scheduling dashboard for factory planners.",
}

export const viewport: Viewport = {
  themeColor: "#2563eb",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${_inter.variable} ${_jetbrains.variable}`}>
      <body className="font-sans antialiased">
        <div className="flex flex-col h-screen">
          <TopNav />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
