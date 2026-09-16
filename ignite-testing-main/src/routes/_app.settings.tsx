import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Save, LogOut, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { store } from "@/lib/store";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ name: "Aarav Mehta", email: "demo@testai.io", role: "QA Lead" });
  const [company, setCompany] = useState({ name: "TestAI Labs", domain: "testai.io", timezone: "Asia/Kolkata" });
  const [aiModel, setAiModel] = useState("GPT");
  const [apiKey, setApiKey] = useState("sk-test-9aZ4•••••••••••••••••QwK1");
  const [showKey, setShowKey] = useState(false);
  const [notif, setNotif] = useState({ email: true, inApp: true, weekly: false });

  const save = () => toast.success("Settings saved");
  const logout = () => { store.setUser(null); toast.success("Logged out"); navigate({ to: "/login" }); };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace preferences, AI configuration and notifications.</p>
      </div>

      <Card className="p-6">
        <h3 className="text-sm font-semibold">Profile</h3>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Role</Label><Input value={profile.role} onChange={(e) => setProfile({ ...profile, role: e.target.value })} /></div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold">Company</h3>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Company name</Label><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Domain</Label><Input value={company.domain} onChange={(e) => setCompany({ ...company, domain: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={company.timezone} onValueChange={(v) => setCompany({ ...company, timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Kolkata">Asia/Kolkata</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">America/New_York</SelectItem>
                <SelectItem value="Europe/London">Europe/London</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold">AI configuration</h3>
        <Separator className="my-4" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>AI model</Label>
            <Select value={aiModel} onValueChange={setAiModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="GPT">OpenAI GPT</SelectItem>
                <SelectItem value="Gemini">Google Gemini</SelectItem>
                <SelectItem value="Claude">Anthropic Claude</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>API key</Label>
            <div className="relative">
              <Input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="pr-10 font-mono" />
              <button type="button" onClick={() => setShowKey((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Toggle key visibility">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Stored encrypted. Demo only — not transmitted.</p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold">Notifications</h3>
        <Separator className="my-4" />
        <div className="space-y-4">
          {[
            { key: "email", label: "Email alerts", desc: "Defect updates, run completions" },
            { key: "inApp", label: "In-app notifications", desc: "Live activity and reviews" },
            { key: "weekly", label: "Weekly digest", desc: "Summary delivered every Monday" },
          ].map((row) => (
            <div key={row.key} className="flex items-center justify-between">
              <div><div className="text-sm font-medium">{row.label}</div><div className="text-xs text-muted-foreground">{row.desc}</div></div>
              <Switch checked={notif[row.key as keyof typeof notif]} onCheckedChange={(v) => setNotif({ ...notif, [row.key]: v })} />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="destructive" onClick={logout}><LogOut className="h-4 w-4" /> Logout</Button>
        <Button onClick={save}><Save className="h-4 w-4" /> Save Settings</Button>
      </div>
    </div>
  );
}
