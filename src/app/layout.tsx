import type { Metadata } from "next";
import VersionCheck from "@/components/VersionCheck";
import ErrorBoundary from "@/components/ErrorBoundary";
import { buildId } from "@/lib/version";
import "./globals.css";

export const metadata: Metadata = {
  title: "Livestream AI - Trợ lý giọng nói bán hàng",
  description: "Clone giọng, viết kịch bản AI, phát audio và hỗ trợ trả lời bình luận livestream.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <VersionCheck initialId={buildId()} />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
