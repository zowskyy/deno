import { SiteNav } from "@/components/SiteNav";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}
