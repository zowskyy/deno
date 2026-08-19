import { redirect } from "next/navigation";
import { getRandomPage } from "@/lib/discovery";

export default function ExploreRandomPage() {
  const page = getRandomPage();
  if (!page) redirect("/explore");
  redirect(`/@${page.handle}`);
}
