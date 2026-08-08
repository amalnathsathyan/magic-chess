"use client";

import { motion } from "framer-motion";
import { Settings, Volume2 } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">Configure your Magic Chess experience.</p>
      </motion.div>

      <div className="mt-6 space-y-4">
        <div className="glass-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Volume2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Sound Effects</p>
              <p className="text-xs text-muted-foreground">Play sounds for moves, captures, and game events</p>
            </div>
          </div>
          {/* Toggle placeholder — sounds are always on for now */}
          <div className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-primary">
            <span className="inline-block h-4 w-4 transform translate-x-4 rounded-full bg-white shadow" />
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">More settings coming soon</p>
              <p className="text-xs text-muted-foreground">
                Theme toggle, notification preferences, and account settings will be added here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
