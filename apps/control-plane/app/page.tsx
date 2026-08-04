import { redirect } from "next/navigation";

export default function ControlPlaneHome() {
  redirect("/tenants/new");
}
