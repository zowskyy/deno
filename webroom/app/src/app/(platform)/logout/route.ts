import { redirect } from "next/navigation";
import { logOut } from "@/lib/session";

export async function POST() {
  await logOut();
  redirect("/");
}
