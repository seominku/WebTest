import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import { FavoritesProvider } from "@/components/favorites-provider";
import { AreaUnitProvider } from "@/components/area-unit-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "부동산 매물 플랫폼",
  description: "검증된 매물을 찾고 관리하는 부동산 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full min-w-0 flex-col overflow-x-clip">
        <AreaUnitProvider>
          <AuthProvider>
            <FavoritesProvider>
              <SiteHeader />
              <div className="min-w-0 flex-1">{children}</div>
            </FavoritesProvider>
          </AuthProvider>
        </AreaUnitProvider>
      </body>
    </html>
  );
}
