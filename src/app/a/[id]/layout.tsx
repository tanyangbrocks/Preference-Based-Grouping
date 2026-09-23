import type { Metadata } from "next";
import { getStore } from "@/lib/store";

// 分享到 LINE / Discord 時，預覽卡片顯示活動名稱；活動頁不讓搜尋引擎收錄
export async function generateMetadata({ params }: LayoutProps<"/a/[id]">): Promise<Metadata> {
  const { id } = await params;
  const a = await getStore().getActivity(id).catch(() => null);
  const title = a ? `${a.title}｜志願分組` : "志願分組";
  const description = a
    ? `請在截止前排好你的職位志願（${a.roles.map((r) => r.name).join("、")}）`
    : undefined;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    robots: { index: false, follow: false },
  };
}

export default function ActivityLayout({ children }: LayoutProps<"/a/[id]">) {
  return children;
}
