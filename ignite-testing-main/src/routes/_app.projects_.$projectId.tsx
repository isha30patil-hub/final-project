import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bug,
  ClipboardCheck,
  FileText,
  KeyRound,
  PlayCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { API_URL } from "@/lib/api";

export const Route = createFileRoute("/_app/projects_/$projectId")({
  component: ProjectDetailsPage,
});

type Credential = { role: string; has_credentials: boolean; created_at?: string };

function TestEnvironmentCard({
  projectId,
  initialBaseUrl,
}: {
  projectId: string;
  initialBaseUrl: string | null;
}) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl || "");
  const [savingUrl, setSavingUrl] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [form, setForm] = useState({ role: "", username: "", password: "" });
  const [savingCred, setSavingCred] = useState(false);

  const loadCredentials = () => {
    fetch(`${API_URL}/projects/${projectId}/credentials`)
      .then((res) => res.json())
      .then((res) => setCredentials(Array.isArray(res) ? res : []))
      .catch(() => toast.error("Failed to load stored credentials"));
  };

  useEffect(() => {
    loadCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const saveBaseUrl = async () => {
    if (!baseUrl.trim()) {
      toast.error("Enter a website URL first");
      return;
    }
    setSavingUrl(true);
    try {
      const res = await fetch(`${API_URL}/projects/${projectId}/base-url`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_url: baseUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save URL");
      toast.success("Website URL saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save URL");
    } finally {
      setSavingUrl(false);
    }
  };

  const saveCredential = async () => {
    if (!form.role.trim() || !form.username.trim() || !form.password.trim()) {
      toast.error("Role, username and password are all required");
      return;
    }
    setSavingCred(true);
    try {
      const res = await fetch(`${API_URL}/projects/${projectId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save credentials");
      toast.success(`Credentials saved for role "${form.role}"`);
      setForm({ role: "", username: "", password: "" });
      loadCredentials();
    } catch (err: any) {
      toast.error(err.message || "Failed to save credentials");
    } finally {
      setSavingCred(false);
    }
  };

  const deleteCredential = async (role: string) => {
    try {
      const res = await fetch(
        `${API_URL}/projects/${projectId}/credentials/${encodeURIComponent(role)}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to remove credentials");
      toast.success(`Removed credentials for "${role}"`);
      loadCredentials();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove credentials");
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold">Test Environment</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Required before scripts can be generated or executed. Credentials are encrypted at rest and
        are never shown again after saving — AI-generated test cases only ever reference role
        placeholders like <code className="rounded bg-muted px-1">{"{{ADMIN_USERNAME}}"}</code>.
      </p>

      <div className="space-y-1.5">
        <Label>Website URL</Label>
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <Button onClick={saveBaseUrl} disabled={savingUrl}>
            {savingUrl ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <Separator className="my-4" />

      <div className="space-y-3">
        <Label>Role credentials</Label>

        {credentials.length === 0 && (
          <p className="text-xs text-muted-foreground">No credentials configured yet.</p>
        )}

        {credentials.map((c) => (
          <div
            key={c.role}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2"
          >
            <div className="text-sm">
              <span className="font-medium">{c.role}</span>
              <span className="ml-2 text-xs text-muted-foreground">configured</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => deleteCredential(c.role)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}

        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Role (e.g. Admin)"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
          <Input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button variant="secondary" onClick={saveCredential} disabled={savingCred}>
            {savingCred ? "Saving..." : "Add / Update"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ProjectDetailsPage() {
  const { projectId } = Route.useParams();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`${API_URL}/projects/${projectId}/summary`)
      .then((res) => res.json())
      .then((res) => setData(res));
  }, [projectId]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    data?.testcase_status?.forEach((s: any) => {
      map[s.status] = s.count;
    });
    return map;
  }, [data]);

  if (!data) return <div className="p-6">Loading project...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" className="mb-2 px-0">
            <Link to="/projects">
              <ArrowLeft className="h-4 w-4" /> Back to Projects
            </Link>
          </Button>

          <h1 className="text-2xl font-semibold tracking-tight">{data.project.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.project.description || "No description added"}
          </p>
        </div>

        <Badge variant="outline" className="bg-success/15 text-success border-success/30">
          Active
        </Badge>
      </div>

      <TestEnvironmentCard projectId={projectId} initialBaseUrl={data.project.base_url} />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" /> Total Test Cases
          </div>
          <div className="mt-2 text-3xl font-bold">{data.total_testcases}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardCheck className="h-4 w-4" /> Approved
          </div>
          <div className="mt-2 text-3xl font-bold">{statusCounts.Approved || 0}</div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <PlayCircle className="h-4 w-4" /> Passed / Failed
          </div>
          <div className="mt-2 text-3xl font-bold">
            {statusCounts.Passed || 0} / {statusCounts.Failed || 0}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bug className="h-4 w-4" /> Total Defects
          </div>
          <div className="mt-2 text-3xl font-bold">{data.total_defects}</div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {["Generated", "Approved", "Rejected", "Passed", "Failed"].map((status) => (
          <Card key={status} className="p-4 text-center">
            <div className="text-2xl font-semibold">{statusCounts[status] || 0}</div>
            <div className="text-xs text-muted-foreground">{status}</div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Project Test Cases</h3>
          <Badge variant="outline">{data.testcases.length} cases</Badge>
        </div>

        <div className="space-y-2">
          {data.testcases.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No test cases generated for this project yet.
            </div>
          )}

          {data.testcases.map((tc: any) => (
            <div key={tc.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{tc.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    TC-{String(tc.id).padStart(3, "0")}
                  </div>
                </div>

                <Badge variant="outline">{tc.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Linked Defects</h3>
          <Badge variant="outline">{data.defects.length} defects</Badge>
        </div>

        <div className="space-y-2">
          {data.defects.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No defects logged for this project yet.
            </div>
          )}

          {data.defects.map((d: any) => (
            <div key={d.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{d.defect_title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    DEF-{String(d.id).padStart(3, "0")} · Linked TC-
                    {String(d.testcase_id).padStart(3, "0")}
                  </div>
                </div>

                <Badge variant="outline">{d.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
