import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Beaker, Mail, Lock, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { store } from "@/lib/store";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const VALID_USERS = [
  {
    email: "manager@testai.com",
    password: "Manager@123",
    role: "project_manager",
    name: "Project Manager",
  },
  {
    email: "tester@testai.com",
    password: "Tester@123",
    role: "tester",
    name: "Tester",
  },
] as const;

type ValidUser = (typeof VALID_USERS)[number];

function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  const loginAsUser = (user: ValidUser) => {
    setLoading(true);
    setError(null);

    setTimeout(() => {
      store.setUser({ name: user.name, email: user.email });

      window.localStorage.setItem("isLoggedIn", "true");
      window.localStorage.setItem("userName", user.name);
      window.localStorage.setItem("userEmail", user.email);
      window.localStorage.setItem("userRole", user.role);

      toast.success(`Signed in as ${user.name}`);
      navigate({ to: "/dashboard" });
    }, 500);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const matchedUser = VALID_USERS.find(
      (user) =>
        user.email.toLowerCase() === email.trim().toLowerCase() &&
        user.password === password
    );

    if (!matchedUser) {
      setError("Invalid email or password. Please use valid Project Manager or Tester credentials.");
      toast.error("Invalid email or password");
      return;
    }

    loginAsUser(matchedUser);
  };

  const submitForgot = () => {
    if (!forgotEmail.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }

    toast.success(`Reset link sent to ${forgotEmail}`);
    setForgotOpen(false);
    setForgotEmail("");
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-sidebar-primary/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-info/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar-primary">
            <Beaker className="h-6 w-6 text-sidebar-primary-foreground" />
          </div>

          <div>
            <div className="text-xl font-semibold">TestAI</div>
            <div className="text-xs uppercase tracking-widest text-sidebar-foreground/60">
              Test Intelligence Suite
            </div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">
            Test Case Tracking and Monitoring Platform
          </h1>

          <p className="text-sidebar-foreground/70">
            Upload SRS or SOW documents, generate test cases, review them, execute
            approved cases, track defects, and monitor reports in one workspace.
          </p>

          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { k: "RBAC", v: "Role-based access" },
              { k: "SRS", v: "Document-based testing" },
              { k: "QA", v: "Execution tracking" },
            ].map((s) => (
              <div
                key={s.v}
                className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3"
              >
                <div className="text-2xl font-semibold text-sidebar-primary-foreground">
                  {s.k}
                </div>
                <div className="text-[11px] text-sidebar-foreground/70">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-sidebar-foreground/50">
          © 2026 TestAI · Internal QA Platform
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <Card className="w-full max-w-md p-8 shadow-xl">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Beaker className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-lg font-semibold">TestAI</div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">
            Sign in to your workspace
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Sign in using registered Project Manager or Tester credentials.
          </p>

          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Project Manager:</span>{" "}
              manager@testai.com / Manager@123
            </div>
            <div className="mt-1">
              <span className="font-medium text-foreground">Tester:</span>{" "}
              tester@testai.com / Tester@123
            </div>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>

              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  placeholder="Enter work email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>

                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  placeholder="Enter password"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>

            <div className="grid gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => loginAsUser(VALID_USERS[0])}
                disabled={loading}
              >
                <Zap className="mr-2 h-4 w-4" />
                Quick Login as Project Manager
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => loginAsUser(VALID_USERS[1])}
                disabled={loading}
              >
                <Zap className="mr-2 h-4 w-4" />
                Quick Login as Tester
              </Button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Only registered Project Manager and Tester demo accounts are allowed.
          </p>
        </Card>
      </div>

      {/* Forgot password modal */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              We'll email you a link to set a new password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              placeholder="you@company.com"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitForgot}>Send reset link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}