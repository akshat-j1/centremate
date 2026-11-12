import CentreMate from "@/components/centremate";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CentreMate centreId={id} />;
}
