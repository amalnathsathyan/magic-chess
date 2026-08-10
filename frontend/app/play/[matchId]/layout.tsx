export const dynamicParams = true;

export function generateStaticParams() {
  return [{ matchId: "placeholder" }];
}

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
