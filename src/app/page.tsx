"use client";

import { useEffect, useState } from "react";

interface Newsletter {
  id: string;
  from: string;
  subject: string;
  date: string;
  summary: string;
  driveLink: string;
  processedAt: string;
}

interface Settings {
  senders: string[];
  driveFolderPrefix: string;
  isAuthenticated: boolean;
}

export default function Home() {
  const [newsletters, setNewsletters] = useState<Record<string, Newsletter[]>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningCron, setRunningCron] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/newsletters").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([nlData, settingsData]) => {
        setNewsletters(nlData.newsletters || {});
        setSettings(settingsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const runManualFetch = async () => {
    setRunningCron(true);
    try {
      const res = await fetch("/api/cron", {
        headers: { Authorization: `Bearer ${prompt("Enter your CRON_SECRET:")}` },
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Error (${res.status}): ${data.error || JSON.stringify(data)}`);
        return;
      }
      alert(`Processed: ${data.processed}, Skipped: ${data.skipped}`);
      // Refresh newsletters
      const nlRes = await fetch("/api/newsletters");
      const nlData = await nlRes.json();
      setNewsletters(nlData.newsletters || {});
    } catch (err) {
      alert("Failed to run: " + err);
    } finally {
      setRunningCron(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lg text-gray-500">Loading...</div>
      </div>
    );
  }

  const dates = Object.keys(newsletters).sort().reverse();

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Newsletter Agent</h1>
            <p className="text-sm text-gray-500">Your daily newsletters, organized</p>
          </div>
          <div className="flex items-center gap-3">
            {settings && !settings.isAuthenticated && (
              <a
                href="/api/auth"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Connect Gmail
              </a>
            )}
            {settings?.isAuthenticated && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                Gmail Connected
              </span>
            )}
            <button
              onClick={runManualFetch}
              disabled={runningCron || !settings?.isAuthenticated}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runningCron ? "Running..." : "Fetch Now"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Tracked Senders */}
        {settings && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Tracking {settings.senders.length} newsletters
            </h2>
            <div className="flex flex-wrap gap-2">
              {settings.senders.map((sender) => (
                <span
                  key={sender}
                  className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm text-gray-700"
                >
                  {sender}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Newsletters by Date */}
        {dates.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">&#128235;</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No newsletters yet</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              {settings?.isAuthenticated
                ? 'Click "Fetch Now" to collect today\'s newsletters, or wait for the scheduled run at 8 AM / 8 PM.'
                : 'Click "Connect Gmail" to get started.'}
            </p>
          </div>
        ) : (
          dates.map((date) => (
            <section key={date} className="mb-10">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                {formatDate(date)}
              </h2>
              <div className="space-y-4">
                {newsletters[date].map((nl) => (
                  <article
                    key={nl.id}
                    className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{nl.subject}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {nl.from} &middot; {new Date(nl.date).toLocaleTimeString()}
                        </p>
                      </div>
                      {nl.driveLink && (
                        <a
                          href={nl.driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                        >
                          Open PDF
                        </a>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-600 mb-1">Summary</p>
                      <p className="text-gray-700 text-sm leading-relaxed">{nl.summary}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
