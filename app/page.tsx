"use client";
import Link from "next/link";
import { FileText, Bell, Settings, ArrowRight, Zap } from "lucide-react";

const cards = [
  {
    href: "/sprint-review",
    icon: FileText,
    color: "bg-blue-500",
    title: "Sprint Review",
    description:
      "Enter a Sprint ID to automatically generate a Confluence page with epics and user stories in tabular format.",
    cta: "Generate Page",
  },
  {
    href: "/alerts",
    icon: Bell,
    color: "bg-purple-500",
    title: "Teams Alerts",
    description:
      "Configure watch rules to send MS Teams notifications when new Jira tickets are created or assigned.",
    cta: "Manage Rules",
  },
  {
    href: "/config",
    icon: Settings,
    color: "bg-gray-600",
    title: "Configuration",
    description:
      "Set up your Jira, Confluence and MS Teams credentials and connection settings.",
    cta: "Open Config",
  },
];

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="text-blue-500" size={28} />
          <h1 className="text-3xl font-bold text-gray-900">Jira Automation</h1>
        </div>
        <p className="text-gray-500 text-lg">
          Automate your Jira &amp; Confluence workflows and keep your team in sync via MS Teams.
        </p>
      </div>

      {/* Quick start */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-10">
        <h2 className="font-semibold text-blue-800 mb-2">🚀 Quick Start</h2>
        <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
          <li>
            Go to{" "}
            <Link href="/config" className="underline font-medium">
              Config
            </Link>{" "}
            and enter your Jira, Confluence &amp; Teams credentials
          </li>
          <li>
            Use{" "}
            <Link href="/sprint-review" className="underline font-medium">
              Sprint Review
            </Link>{" "}
            to generate a Confluence page from any Sprint ID
          </li>
          <li>
            Set up{" "}
            <Link href="/alerts" className="underline font-medium">
              Teams Alerts
            </Link>{" "}
            rules to get notified when tickets are created or assigned
          </li>
        </ol>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map(({ href, icon: Icon, color, title, description, cta }) => (
          <Link
            key={href}
            href={href}
            className="group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-blue-300 transition-all"
          >
            <div
              className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center mb-4`}
            >
              <Icon className="text-white" size={22} />
            </div>
            <h3 className="font-semibold text-gray-900 text-lg mb-2">
              {title}
            </h3>
            <p className="text-gray-500 text-sm mb-4">{description}</p>
            <span className="text-blue-600 text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
              {cta} <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
