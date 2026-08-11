export function generateStaticParams() {
  return [{ matchId: "placeholder" }];
}

export default function SpectateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
