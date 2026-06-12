"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  FileText,
  Bell,
  Zap,
} from "lucide-react";

const links = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/sprint-review", icon: FileText, label: "Sprint Review" },
  { href: "/alerts", icon: Bell, label: "Teams Alerts" },
  { href: "/config", icon: Settings, label: "Config" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-700">
        <Zap className="text-blue-400" size={22} />
        <span className="font-bold text-lg tracking-tight">Jira Automation</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4">
        {links.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors
                ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 text-xs text-gray-500 border-t border-gray-700">
        v1.0.0
      </div>
    </aside>
  );
}
