import Link from "next/link";

const sections = [
  { key: "institution", label: "Institution setup", href: "/admin/institution-setup" },
  { key: "storage", label: "Media and storage", href: "/admin/storage" },
  { key: "service-accounts", label: "Service accounts", href: "/admin/service-accounts" },
] as const;

export function AdminSectionNavigation({
  active,
}: {
  active: (typeof sections)[number]["key"];
}) {
  return (
    <nav className="admin-section-navigation" aria-label="Administration sections">
      {sections.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          className={section.key === active ? "active" : undefined}
          aria-current={section.key === active ? "page" : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
