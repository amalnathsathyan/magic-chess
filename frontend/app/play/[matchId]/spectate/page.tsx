import { redirect } from "next/navigation";

interface SpectatePageProps {
  params: Promise<{ matchId: string }>;
}

/** Keep old spectator links working while using one canonical player/watch URL. */
export default async function SpectatePage({ params }: SpectatePageProps) {
  const { matchId } = await params;
  redirect(`/play/${encodeURIComponent(matchId)}`);
}
