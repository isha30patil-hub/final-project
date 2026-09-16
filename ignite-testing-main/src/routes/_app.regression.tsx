import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GitBranch, Sparkles, Network, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/regression")({
  component: RegressionPage,
});

const dependencies: Record<string, string[]> = {
  Login: ["Dashboard", "Profile", "Security"],
  Payment: ["Orders", "Invoice", "Notification"],
  Registration: ["Login", "Email Verification"],
  Dashboard: ["Reports", "Notifications"],
  Profile: ["Login", "KYC"],
};

const suggestionsByModule: Record<string, { id: string; module: string; scenario: string; priority: "High" | "Medium" | "Low"; reason: string }[]> = {
  Login: [
    { id: "RT-001", module: "Login", scenario: "Verify successful login with valid credentials", priority: "High", reason: "Module directly changed" },
    { id: "RT-002", module: "Dashboard", scenario: "Dashboard loads after login redirect", priority: "High", reason: "Dependent on Login" },
    { id: "RT-003", module: "Profile", scenario: "Profile data fetched using session token", priority: "Medium", reason: "Uses login session" },
    { id: "RT-004", module: "Security", scenario: "Session expires after timeout", priority: "Medium", reason: "Shared auth layer" },
  ],
  Payment: [
    { id: "RT-005", module: "Payment", scenario: "Card payment end-to-end", priority: "High", reason: "Module directly changed" },
    { id: "RT-006", module: "Orders", scenario: "Order created after successful payment", priority: "High", reason: "Downstream of Payment" },
    { id: "RT-007", module: "Invoice", scenario: "Invoice PDF generated", priority: "Medium", reason: "Invoice depends on Payment" },
    { id: "RT-008", module: "Notification", scenario: "Payment confirmation email", priority: "Medium", reason: "Triggered by Payment" },
  ],
  Registration: [
    { id: "RT-009", module: "Registration", scenario: "New user signup", priority: "High", reason: "Module directly changed" },
    { id: "RT-010", module: "Login", scenario: "Newly registered user can login", priority: "High", reason: "Login depends on Registration" },
    { id: "RT-011", module: "Email Verification", scenario: "Verification link works", priority: "Medium", reason: "Post-registration flow" },
  ],
  Dashboard: [
    { id: "RT-012", module: "Dashboard", scenario: "KPI cards render with live data", priority: "High", reason: "Module directly changed" },
    { id: "RT-013", module: "Reports", scenario: "Drill-down to reports works", priority: "Medium", reason: "Dashboard links to Reports" },
  ],
  Profile: [
    { id: "RT-014", module: "Profile", scenario: "Update profile and persist", priority: "High", reason: "Module directly changed" },
    { id: "RT-015", module: "KYC", scenario: "KYC documents linked to profile", priority: "Medium", reason: "Shared profile entity" },
  ],
};

function RegressionPage() {
  const [mod, setMod] = useState<string>("Payment");
  const [suggestions, setSuggestions] = useState<typeof suggestionsByModule[string]>([]);
  const deps = dependencies[mod] ?? [];

  const suggest = () => {
    setSuggestions(suggestionsByModule[mod] ?? []);
    toast.success(`Smart regression set generated for ${mod}`);
  };

  const createRun = () => {
    if (suggestions.length === 0) return toast.error("Generate suggestions first");
    toast.success("Regression test run created successfully");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Smart Regression</h1>
        <p className="text-sm text-muted-foreground">AI-powered impact analysis — pick a changed module and let TestAI suggest what to retest.</p>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Changed module</div>
            <Select value={mod} onValueChange={setMod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(dependencies).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex items-end gap-2">
            <Button onClick={suggest}><Sparkles className="h-4 w-4" /> Suggest Regression Test Cases</Button>
            <Button variant="secondary" onClick={createRun}><PlayCircle className="h-4 w-4" /> Create Regression Test Run</Button>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2"><Network className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Dependency map</h3></div>
        <p className="mt-1 text-xs text-muted-foreground">Changes to <span className="font-medium text-foreground">{mod}</span> can ripple into:</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="rounded-lg border-2 border-primary bg-primary/5 px-4 py-2 text-sm font-medium">{mod}</div>
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-2">
            {deps.length === 0 ? (
              <span className="text-sm text-muted-foreground">No dependent modules detected.</span>
            ) : deps.map((d) => (
              <div key={d} className="rounded-lg border border-border bg-accent/40 px-3 py-1.5 text-sm">{d}</div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold">Recommended regression test cases</h3>
          {suggestions.length > 0 && <Badge variant="outline">{suggestions.length} suggestions</Badge>}
        </div>
        {suggestions.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Click <span className="font-medium text-foreground">Suggest Regression Test Cases</span> to see AI recommendations.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead><TableHead>Module</TableHead><TableHead>Scenario</TableHead><TableHead>Priority</TableHead><TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.id}</TableCell>
                  <TableCell><Badge variant="secondary">{s.module}</Badge></TableCell>
                  <TableCell>{s.scenario}</TableCell>
                  <TableCell><Badge variant="outline">{s.priority}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
