export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ matchId: "placeholder" }];
}

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
